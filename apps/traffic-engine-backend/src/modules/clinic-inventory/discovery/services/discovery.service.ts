import { Injectable, NotFoundException, BadRequestException, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { DiscoveryConfigService } from '../config/services/discovery-config.service';
import { GooglePlacesAdapter } from '../adapters/google-places.adapter';
import { WebsiteFetcherAdapter } from '../adapters/website-fetcher.adapter';
import { LlmEnrichmentAdapter } from '../adapters/llm-enrichment.adapter';
import { computeConfidence, ConfidenceWeights } from '../pipeline/confidence-scorer';
import { computeDedupKey } from '../pipeline/dedup';
import { EffectiveDiscoveryConfig, PipelineStep } from '../config/discovery-pipeline.types';
import { CLINIC_DISCOVERY_ENRICH_QUEUE } from '../../constants/queue.constants';
import { DiscoveryTrigger, Prisma } from '@prisma/client';
import { ClinicPublishBridge } from '../../clinic-publish.bridge';
import { StartRunDto } from '../dto/start-run.dto';
import { QuickDiscoveryDto } from '../dto/quick-discovery.dto';
import { normalizeClinicType, toTreatmentCode } from '../utils/treatment-code.util';

const FULL_GOOGLE_DETAIL_FIELDS = [
  'website',
  'phone',
  'formatted_phone_number',
  'opening_hours',
  'photos',
  'reviews',
  'business_status',
  'formatted_address',
  'geometry',
  'rating',
  'user_ratings_total',
  'name',
  'place_id',
  'url',
  'editorial_summary',
  'price_level',
  'type',
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configSvc: DiscoveryConfigService,
    private readonly places: GooglePlacesAdapter,
    private readonly fetcher: WebsiteFetcherAdapter,
    private readonly llm: LlmEnrichmentAdapter,
    private readonly configService: ConfigService,
    @InjectQueue(CLINIC_DISCOVERY_ENRICH_QUEUE) private readonly enrichQueue: Queue,
    @Optional() private readonly publishing?: ClinicPublishBridge,
  ) {}

  // ── Start a run (enqueues per-candidate enrichment jobs) ──────────────────

  async startRun(dto: StartRunDto) {
    const globalKill = this.configService.get<string>('DISCOVERY_GLOBAL_KILL_SWITCH') === 'true';
    if (globalKill) throw new BadRequestException('DISCOVERY_GLOBAL_KILL_SWITCH is enabled');

    const city = await this.prisma.city.findUnique({ where: { id: dto.cityId } });
    if (!city) throw new NotFoundException(`City ${dto.cityId} not found`);

    const effective = await this.configSvc.getEffectiveConfig(dto.cityId, dto.configOverride);
    const dryRun = dto.dryRun ?? effective.pipeline.dryRun ?? false;

    const run = await this.prisma.discoveryRun.create({
      data: {
        cityId: dto.cityId,
        triggeredBy: dto.triggeredBy ?? 'ADMIN',
        status: 'RUNNING',
        dryRun,
        configOverride: (dto.configOverride ?? undefined) as Prisma.InputJsonValue | undefined,
        configSnapshot: effective as unknown as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });

    // Enqueue the discovery run job
    await this.enrichQueue.add(
      'discovery.run',
      { runId: run.id, cityId: dto.cityId, config: effective },
      { jobId: `discovery-run-${run.id}`, removeOnComplete: true },
    );

    this.logger.log(`Discovery run ${run.id} started for city ${city.name} (dryRun=${dryRun})`);
    return run;
  }

  async quickDiscovery(dto: QuickDiscoveryDto) {
    const city = await this.prisma.city.findUnique({
      where: { id: dto.cityId },
      include: { country: true },
    });
    if (!city) throw new NotFoundException(`City ${dto.cityId} not found`);

    const clinicTypes = dto.clinicTypes.map(normalizeClinicType);
    const treatmentCodes = clinicTypes.map(toTreatmentCode).filter(Boolean);
    const keywords = clinicTypes.map((type) => `${type} clinic ${city.name}`);
    const maxResults = Math.min(Math.max(dto.maxResults, 1), 60);

    const run = await this.startRun({
      cityId: dto.cityId,
      triggeredBy: DiscoveryTrigger.API,
      dryRun: dto.dryRun ?? false,
      configOverride: {
        pipeline: {
          dryRun: dto.dryRun ?? false,
          treatments: treatmentCodes.length ? treatmentCodes : ['IVF'],
          steps: [
            {
              stepKey: 'places_search',
              enabled: true,
              params: { keywords, radiusKm: 25, maxResults, pageDepth: 2 },
            },
            { stepKey: 'dedup', enabled: true, params: {} },
            { stepKey: 'places_details', enabled: true, params: { fields: FULL_GOOGLE_DETAIL_FIELDS } },
            { stepKey: 'website_fetch', enabled: true, params: { timeoutMs: 10000, maxPages: 2 } },
            { stepKey: 'llm_extract', enabled: false, params: {} },
            { stepKey: 'llm_pricing', enabled: false, params: {} },
            { stepKey: 'score', enabled: true, params: { publishThreshold: 0.85 } },
            {
              stepKey: 'publish_gate',
              enabled: true,
              params: {
                requireHumanReview: !(dto.autoApprove ?? false),
                minimumFields: ['addressLine'],
                maxAutoPublishesPerRun: maxResults,
              },
            },
          ],
        },
      },
    });

    if (!dto.autoApprove) {
      return {
        runId: run.id,
        status: run.status,
        candidateCount: 0,
        approved: 0,
        pages: this.buildExpectedPagePaths(city, clinicTypes),
      };
    }

    const candidates = await this.waitForCandidateProcessing(run.id);
    const readyCandidates = candidates.filter((candidate) => candidate.status === 'READY_FOR_REVIEW' || candidate.status === 'AUTO_PUBLISHED');
    const approved = [];

    for (const candidate of readyCandidates) {
      if (candidate.matchedClinicId) {
        approved.push({ candidateId: candidate.id, clinicId: candidate.matchedClinicId });
        continue;
      }
      const result = await this.approveCandidate(candidate.id);
      approved.push({
        candidateId: candidate.id,
        clinicId: result.clinic?.id,
        slug: result.clinic?.slug,
        name: result.clinic?.name,
      });
    }

    const approvedClinicIds = approved
      .map((item) => item.clinicId)
      .filter((id): id is number => typeof id === 'number');
    const approvedClinics = approvedClinicIds.length
      ? await this.prisma.clinic.findMany({
          where: { id: { in: approvedClinicIds } },
          select: { slug: true },
        })
      : [];

    return {
      runId: run.id,
      status: 'COMPLETED',
      candidateCount: candidates.length,
      approved: approved.length,
      pages: this.buildExpectedPagePaths(city, clinicTypes, approvedClinics.map((clinic) => clinic.slug)),
    };
  }

  // ── Execute run synchronously (called by processor) ──────────────────────

  async executeRun(runId: number) {
    const run = await this.prisma.discoveryRun.findUnique({
      where: { id: runId },
      include: { city: true },
    });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);

    const config = run.configSnapshot as unknown as EffectiveDiscoveryConfig;
    const steps = config.pipeline.steps;
    const stats = { discovered: 0, dedup: 0, enriched: 0, autoPublished: 0, queuedForReview: 0, llmCallsMade: 0, costUsd: 0 };

    try {
      const placesStep = this.getStep(steps, 'places_search');
      if (!placesStep?.enabled) {
        await this.completeRun(runId, stats, 'places_search disabled — skipping run');
        return;
      }

      // Step 1: places_search
      const keywords = (placesStep.params.keywords as string[]) ?? ['fertility clinic', 'IVF clinic'];
      const radiusKm = (placesStep.params.radiusKm as number) ?? 25;
      const maxResults = (placesStep.params.maxResults as number) ?? 60;
      const lat = Number(run.city.lat);
      const lng = Number(run.city.lng);

      const allResults: Awaited<ReturnType<GooglePlacesAdapter['searchNearby']>>['results'] = [];

      for (const keyword of keywords) {
        let pageToken: string | undefined;
        do {
          const { results, nextPageToken } = await this.places.searchNearby({ query: keyword, lat, lng, radiusKm, pageToken });
          const remaining = Math.max(maxResults - allResults.length, 0);
          allResults.push(...results.slice(0, remaining));
          pageToken = nextPageToken;
        } while (pageToken && allResults.length < maxResults);
        if (allResults.length >= maxResults) break;
      }
      stats.discovered = allResults.length;
      this.logger.debug(`Run ${runId}: discovered ${allResults.length} candidates`);

      // Step 2: dedup — look up existing placeIds and dedupKeys
      const candidatesToProcess: typeof allResults = [];

      for (const r of allResults) {
        const dedupKey = computeDedupKey(r.placeId, r.websiteUri);

        // Check if already a known clinic
        const existingClinic = r.placeId
          ? await this.prisma.clinic.findUnique({ where: { googlePlaceId: r.placeId } })
          : null;

        // Check if already a candidate in this run
        const existingCandidate = await this.prisma.discoveryCandidate.findUnique({
          where: { runId_dedupKey: { runId, dedupKey } },
        });

        if (existingClinic || existingCandidate) {
          stats.dedup++;
          continue;
        }

        // Create candidate row
        await this.prisma.discoveryCandidate.create({
          data: {
            runId,
            cityId: run.cityId,
            rawName: r.name,
            googlePlaceId: r.placeId,
            websiteUrl: r.websiteUri,
            addressLine: r.formattedAddress,
            lat: r.lat,
            lng: r.lng,
            dedupKey,
            matchedClinicId: (existingClinic as { id: number } | null)?.id ?? null,
            status: 'NEW',
            stepLog: [{ stepKey: 'dedup', status: 'passed', ts: new Date().toISOString() }] as Prisma.InputJsonValue,
          },
        });
        candidatesToProcess.push(r);
      }
      this.logger.debug(`Run ${runId}: ${candidatesToProcess.length} new candidates after dedup`);

      // Enqueue per-candidate enrichment jobs
      for (const r of candidatesToProcess) {
        const dedupKey = computeDedupKey(r.placeId, r.websiteUri);
        const candidate = await this.prisma.discoveryCandidate.findFirst({
          where: { runId, dedupKey },
        });
        if (!candidate) continue;

        await this.enrichQueue.add(
          'discovery.enrich',
          { candidateId: candidate.id, runId, config },
          { jobId: `enrich-${candidate.id}`, removeOnComplete: true },
        );
      }

      await this.prisma.discoveryRun.update({
        where: { id: runId },
        data: { stats: stats as Prisma.InputJsonValue },
      });
    } catch (err) {
      await this.prisma.discoveryRun.update({
        where: { id: runId },
        data: { status: 'FAILED', completedAt: new Date(), errorLog: String(err), stats: stats as Prisma.InputJsonValue },
      });
      throw err;
    }
  }

  // ── Enrich a single candidate ─────────────────────────────────────────────

  async enrichCandidate(candidateId: number, config: EffectiveDiscoveryConfig) {
    const candidate = await this.prisma.discoveryCandidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundException(`Candidate ${candidateId} not found`);

    const steps = config.pipeline.steps;
    const stepLog: Array<{ stepKey: string; status: string; durationMs: number; error?: string }> = 
      (candidate.stepLog as typeof stepLog | null) ?? [];

    const enrichmentPayload: Record<string, unknown> = (candidate.enrichmentPayload as Record<string, unknown> | null) ?? {};

    const addStep = (key: string, status: string, durationMs: number, error?: string) => {
      stepLog.push({ stepKey: key, status, durationMs, error });
    };

    await this.prisma.discoveryCandidate.update({
      where: { id: candidateId },
      data: { status: 'ENRICHING' },
    });

    // Step: places_details
    const detailsStep = this.getStep(steps, 'places_details');
    let websiteUrl = candidate.websiteUrl ?? '';
    let businessStatus = 'UNKNOWN';

    if (detailsStep?.enabled && candidate.googlePlaceId) {
      const t0 = Date.now();
      try {
        const fields = (detailsStep.params.fields as string[]) ?? FULL_GOOGLE_DETAIL_FIELDS;
        const details = await this.places.getPlaceDetails(candidate.googlePlaceId, fields);
        websiteUrl = details.website ?? candidate.websiteUrl ?? '';
        businessStatus = details.businessStatus ?? 'UNKNOWN';
        enrichmentPayload.placeDetails = details;
        addStep('places_details', 'ok', Date.now() - t0);

        await this.prisma.discoveryCandidate.update({
          where: { id: candidateId },
          data: { websiteUrl: websiteUrl || undefined },
        });
      } catch (err) {
        addStep('places_details', 'failed', Date.now() - t0, String(err));
      }
    }

    // Step: website_fetch
    const fetchStep = this.getStep(steps, 'website_fetch');
    let fetchResult: Awaited<ReturnType<WebsiteFetcherAdapter['fetch']>> = {
      url: websiteUrl,
      resolvedUrl: websiteUrl,
      statusCode: 0,
      rawText: '',
      hasFertilityTerms: false,
      hasAccreditationTerms: false,
      mentionedTreatments: [],
    };

    if (fetchStep?.enabled && websiteUrl) {
      const t0 = Date.now();
      try {
        const timeout = (fetchStep.params.timeoutMs as number) ?? 8000;
        fetchResult = await this.fetcher.fetch(websiteUrl, timeout);
        enrichmentPayload.websiteFetch = {
          statusCode: fetchResult.statusCode,
          title: fetchResult.title,
          hasFertilityTerms: fetchResult.hasFertilityTerms,
          mentionedTreatments: fetchResult.mentionedTreatments,
        };
        addStep('website_fetch', 'ok', Date.now() - t0);
      } catch (err) {
        addStep('website_fetch', 'failed', Date.now() - t0, String(err));
      }
    }

    // Step: llm_extract
    const llmExtractStep = this.getStep(steps, 'llm_extract');
    if (llmExtractStep?.enabled && fetchResult.rawText) {
      const t0 = Date.now();
      try {
        const extracted = await this.llm.extract(fetchResult.rawText, llmExtractStep.params);
        enrichmentPayload.llmExtract = extracted;
        addStep('llm_extract', 'ok', Date.now() - t0);
      } catch (err) {
        addStep('llm_extract', 'failed', Date.now() - t0, String(err));
      }
    } else if (llmExtractStep && !llmExtractStep.enabled) {
      addStep('llm_extract', 'skipped', 0);
    }

    // Step: llm_pricing
    const llmPricingStep = this.getStep(steps, 'llm_pricing');
    if (llmPricingStep?.enabled && fetchResult.rawText) {
      const t0 = Date.now();
      try {
        const pricing = await this.llm.extractPricing(fetchResult.rawText, llmPricingStep.params);
        enrichmentPayload.llmPricing = pricing;
        addStep('llm_pricing', 'ok', Date.now() - t0);
      } catch (err) {
        addStep('llm_pricing', 'failed', Date.now() - t0, String(err));
      }
    } else if (llmPricingStep && !llmPricingStep.enabled) {
      addStep('llm_pricing', 'skipped', 0);
    }

    // Step: score
    const scoreStep = this.getStep(steps, 'score');
    let confidenceScore = 0;
    let confidenceBreakdown: Record<string, number> = {};

    if (scoreStep?.enabled) {
      const t0 = Date.now();
      const weights = (scoreStep.params.weights as ConfidenceWeights) ?? {
        nameMatch: 0.25, websiteResolves: 0.15, fertilityTerms: 0.2, accreditation: 0.15, insidePolygon: 0.15, operational: 0.1,
      };
      const breakdown = computeConfidence({
        name: candidate.rawName ?? '',
        websiteStatusCode: fetchResult.statusCode,
        hasFertilityTerms: fetchResult.hasFertilityTerms,
        hasAccreditationTerms: fetchResult.hasAccreditationTerms,
        businessStatus,
        insidePolygon: true, // simplified — the Places search already radius-filtered
        searchKeywords: ['fertility', 'ivf', 'fertilidad'],
      }, weights);
      confidenceScore = breakdown.total;
      confidenceBreakdown = breakdown;
      addStep('score', 'ok', Date.now() - t0);
    }

    // Step: publish_gate
    const publishGateStep = this.getStep(steps, 'publish_gate');
    const publishThreshold = (scoreStep?.params.publishThreshold as number) ?? 0.85;
    const requireHumanReview = (publishGateStep?.params.requireHumanReview as boolean) ?? true;
    const maxAutoPublishes = (publishGateStep?.params.maxAutoPublishesPerRun as number) ?? 10;
    const minimumFields = (publishGateStep?.params.minimumFields as string[]) ?? ['websiteUrl', 'addressLine'];
    const dryRun = config.pipeline.dryRun ?? false;

    const meetsMinFields = minimumFields.every((f) => {
      if (f === 'websiteUrl') return !!websiteUrl;
      if (f === 'addressLine') return !!candidate.addressLine;
      return true;
    });

    let newStatus: 'READY_FOR_REVIEW' | 'AUTO_PUBLISHED' | 'FAILED' = 'READY_FOR_REVIEW';

    if (!meetsMinFields) {
      newStatus = 'FAILED';
      addStep('publish_gate', 'failed_min_fields', 0);
    } else if (!requireHumanReview && confidenceScore >= publishThreshold && !dryRun) {
      // Auto-publish path
      const autoPublishCount = await this.prisma.discoveryCandidate.count({
        where: { runId: candidate.runId, status: 'AUTO_PUBLISHED' as const },
      });

      if (autoPublishCount < maxAutoPublishes) {
        newStatus = 'AUTO_PUBLISHED';
        addStep('publish_gate', 'auto_published', 0);
      } else {
        newStatus = 'READY_FOR_REVIEW';
        addStep('publish_gate', 'max_auto_reached', 0);
      }
    } else {
      addStep('publish_gate', dryRun ? 'dry_run_skipped' : 'queued_for_review', 0);
    }

    await this.prisma.discoveryCandidate.update({
      where: { id: candidateId },
      data: {
        status: newStatus,
        confidenceScore,
        confidenceBreakdown: confidenceBreakdown as Prisma.InputJsonValue,
        enrichmentPayload: enrichmentPayload as Prisma.InputJsonValue,
        stepLog: stepLog as Prisma.InputJsonValue,
      },
    });

    // If auto-published and not dry-run, create the clinic
    if (newStatus === 'AUTO_PUBLISHED' && !dryRun) {
      await this.createClinicFromCandidate(candidateId, enrichmentPayload);
    }
  }

  private async createClinicFromCandidate(candidateId: number, enrichmentPayload: Record<string, unknown>) {
    const candidate = await this.prisma.discoveryCandidate.findUnique({ where: { id: candidateId } });
    if (!candidate) return;

    const details = (enrichmentPayload.placeDetails as Record<string, unknown> | null) ?? {};
    const city = await this.prisma.city.findUnique({ where: { id: candidate.cityId } });

    const existingClinic = candidate.googlePlaceId
      ? await this.prisma.clinic.findUnique({ where: { googlePlaceId: candidate.googlePlaceId } })
      : null;
    if (existingClinic) {
      await this.prisma.discoveryCandidate.update({
        where: { id: candidateId },
        data: { matchedClinicId: existingClinic.id },
      });
      return existingClinic;
    }

    const name = candidate.rawName ?? 'Unknown Clinic';
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + `-${candidateId}`;

    const clinic = await this.prisma.clinic.create({
      data: {
        slug,
        name,
        cityId: candidate.cityId,
        countryId: city?.countryId ?? null,
        addressLine: candidate.addressLine ?? (details.formattedAddress as string | undefined),
        lat: candidate.lat ?? undefined,
        lng: candidate.lng ?? undefined,
        websiteUrl: candidate.websiteUrl ?? (details.website as string | undefined),
        phone: details.internationalPhoneNumber as string | undefined,
        googlePlaceId: candidate.googlePlaceId,
        googleRating: details.rating ? (details.rating as number) : undefined,
        googleReviewCount: details.userRatingsTotal as number | undefined,
        openingHours: (details.openingHours ?? details.regularOpeningHours) as Prisma.InputJsonValue | undefined,
        googleMapsUrl: (details.googleMapsUrl ?? details.googleMapsUri) as string | undefined,
        editorialSummary: details.editorialSummary as string | undefined,
        priceLevel: details.priceLevel as number | undefined,
        formattedPhone: (details.formattedPhoneNumber ?? details.formattedPhone) as string | undefined,
        placeTypes: (details.types as string[] | undefined) ?? [],
        googlePhotos: details.photos as Prisma.InputJsonValue | undefined,
        googleReviews: details.reviews as Prisma.InputJsonValue | undefined,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        confidenceScore: candidate.confidenceScore,
        sourcePayload: enrichmentPayload as Prisma.InputJsonValue,
      },
    });

    await this.prisma.discoveryCandidate.update({
      where: { id: candidateId },
      data: { matchedClinicId: clinic.id },
    });

    await this.linkClinicTreatments(clinic.id, candidate.runId, enrichmentPayload);

    this.logger.log(`Auto-published clinic ${clinic.id} (${clinic.name}) from candidate ${candidateId}`);
    this.publishing?.emitClinicPublished(clinic.id).catch(() => undefined);
    return clinic;
  }

  private collectTreatmentCodes(
    enrichmentPayload: Record<string, unknown>,
    runConfig: EffectiveDiscoveryConfig | null,
  ): string[] {
    const codes = new Set<string>();
    const pipeline = runConfig?.pipeline as { treatments?: string[] } | undefined;

    for (const code of pipeline?.treatments ?? []) {
      const normalized = toTreatmentCode(code);
      if (normalized) codes.add(normalized);
    }

    const websiteFetch = enrichmentPayload.websiteFetch as { mentionedTreatments?: string[] } | undefined;
    for (const code of websiteFetch?.mentionedTreatments ?? []) {
      const normalized = toTreatmentCode(code);
      if (normalized) codes.add(normalized);
    }

    const llmExtract = enrichmentPayload.llmExtract as { services?: string[] } | undefined;
    for (const svc of llmExtract?.services ?? []) {
      if (typeof svc === 'string') {
        const normalized = toTreatmentCode(svc);
        if (normalized) codes.add(normalized);
      }
    }

    if (!codes.size) codes.add('IVF');
    return [...codes];
  }

  private async linkClinicTreatments(
    clinicId: number,
    runId: number,
    enrichmentPayload: Record<string, unknown>,
  ): Promise<void> {
    const run = await this.prisma.discoveryRun.findUnique({ where: { id: runId } });
    const runConfig = (run?.configSnapshot as EffectiveDiscoveryConfig | null) ?? null;
    const codes = this.collectTreatmentCodes(enrichmentPayload, runConfig);

    const treatments = await this.prisma.treatment.findMany({
      where: { code: { in: codes }, isActive: true },
    });

    if (!treatments.length) {
      const fallback = await this.prisma.treatment.findUnique({ where: { code: 'IVF' } });
      if (fallback) {
        await this.prisma.clinicTreatment.createMany({
          data: [{ clinicId, treatmentId: fallback.id, isOffered: true }],
          skipDuplicates: true,
        });
      }
      return;
    }

    await this.prisma.clinicTreatment.createMany({
      data: treatments.map((treatment) => ({
        clinicId,
        treatmentId: treatment.id,
        isOffered: true,
      })),
      skipDuplicates: true,
    });

    this.logger.log(`Linked clinic ${clinicId} to treatments: ${treatments.map((t) => t.code).join(', ')}`);
  }

  // ── Admin: approve/reject candidates ─────────────────────────────────────

  async approveCandidate(candidateId: number) {
    const candidate = await this.prisma.discoveryCandidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundException(`Candidate ${candidateId} not found`);

    const enrichmentPayload = (candidate.enrichmentPayload as Record<string, unknown>) ?? {};

    const clinic = await this.createClinicFromCandidate(candidateId, enrichmentPayload);
    await this.prisma.discoveryCandidate.update({
      where: { id: candidateId },
      data: { status: 'AUTO_PUBLISHED' },
    });

    return { clinic, candidate };
  }

  async rejectCandidate(candidateId: number, notes?: string) {
    const candidate = await this.prisma.discoveryCandidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundException(`Candidate ${candidateId} not found`);

    return this.prisma.discoveryCandidate.update({
      where: { id: candidateId },
      data: { status: 'REJECTED', reviewerNotes: notes },
    });
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  listRuns(cityId?: number) {
    return this.prisma.discoveryRun.findMany({
      where: cityId ? { cityId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getRun(id: number) {
    const run = await this.prisma.discoveryRun.findUnique({
      where: { id },
      include: { city: true, _count: { select: { candidates: true } } },
    });
    if (!run) throw new NotFoundException(`Run ${id} not found`);
    return run;
  }

  listCandidates(runId?: number, cityId?: number, status?: string) {
    return this.prisma.discoveryCandidate.findMany({
      where: {
        ...(runId ? { runId } : {}),
        ...(cityId ? { cityId } : {}),
        ...(status ? { status: status as 'READY_FOR_REVIEW' } : {}),
      },
      orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  private getStep(steps: PipelineStep[], key: string): PipelineStep | undefined {
    return steps.find((s) => s.stepKey === key);
  }

  private async waitForCandidateProcessing(runId: number, timeoutMs = 120000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const run = await this.prisma.discoveryRun.findUnique({ where: { id: runId } });
      if (!run) throw new NotFoundException(`Run ${runId} not found`);
      if (run.status === 'FAILED') throw new BadRequestException(run.errorLog ?? `Discovery run ${runId} failed`);

      const candidates = await this.prisma.discoveryCandidate.findMany({
        where: { runId },
        orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'asc' }],
      });
      const active = candidates.some((candidate) => candidate.status === 'NEW' || candidate.status === 'ENRICHING');
      if ((candidates.length > 0 && !active) || (candidates.length === 0 && run.stats)) return candidates;

      await sleep(2000);
    }
    throw new BadRequestException(`Timed out waiting for discovery run ${runId}`);
  }

  private buildExpectedPagePaths(
    city: { slug: string; country?: { name: string } | null },
    clinicTypes: string[],
    clinicSlugs: string[] = [],
  ): string[] {
    const countrySlug = city.country?.name ? slugify(city.country.name) : 'unknown';
    return [
      ...clinicSlugs.map((clinicSlug) => `/clinics/${countrySlug}/${city.slug}/${clinicSlug}`),
      `/clinics/${countrySlug}/${city.slug}`,
      `/clinics/${countrySlug}`,
      ...clinicTypes.map((type) => `/clinics/treatment/${slugify(type)}`),
    ];
  }

  private async completeRun(runId: number, stats: object, note?: string) {
    await this.prisma.discoveryRun.update({
      where: { id: runId },
      data: { status: 'COMPLETED', completedAt: new Date(), stats: stats as Prisma.InputJsonValue, errorLog: note ?? null },
    });
  }
}

