import { Inject, Injectable, Logger, BadGatewayException } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { ClinicsService } from '../services/clinics.service';
import {
  ClinicEnrichmentInput,
  ClinicEnrichmentResult,
  ClinicEnrichmentResultSchema,
} from './clinic-enrichment.types';
import { buildEnrichmentSystemPrompt, buildEnrichmentUserPrompt } from './clinic-enrichment.prompt';
import { LlmClient, LLM_CLIENT } from './llm/llm-client.interface';
import { buildApplyData } from './clinic-enrichment.mapper';

export interface EnrichAndPublishResult {
  clinicId: number;
  enrichment: ClinicEnrichmentResult;
  published: boolean;
  appliedAt: string;
}

@Injectable()
export class ClinicEnrichmentService {
  private readonly logger = new Logger(ClinicEnrichmentService.name);

  constructor(
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    private readonly prisma: PrismaService,
    private readonly clinics: ClinicsService,
  ) {}

  async enrich(input: ClinicEnrichmentInput): Promise<ClinicEnrichmentResult> {
    this.logger.log({
      msg: 'clinic_enrichment_start',
      clinic: input.name,
      location: `${input.city}, ${input.country}`,
    });

    const system = buildEnrichmentSystemPrompt(input.city, input.country);
    const user = buildEnrichmentUserPrompt(input);

    let rawJson: string;
    try {
      rawJson = await this.llm.completeJson({ system, user });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ msg: 'clinic_enrichment_llm_error', clinic: input.name, error: message });
      throw new BadGatewayException(`LLM call failed for clinic enrichment: ${message}`);
    }

    const cleaned = rawJson
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.error({
        msg: 'clinic_enrichment_parse_error',
        clinic: input.name,
        rawSnippet: rawJson.slice(0, 300),
      });
      throw new BadGatewayException(
        'LLM returned non-JSON content. Check OPENMODEL configuration and retry.',
      );
    }

    const validation = ClinicEnrichmentResultSchema.safeParse(parsed);
    if (!validation.success) {
      this.logger.error({
        msg: 'clinic_enrichment_schema_error',
        clinic: input.name,
        issues: validation.error.issues,
      });
      throw new BadGatewayException(
        `LLM output failed schema validation: ${validation.error.issues.map((i) => i.message).join('; ')}`,
      );
    }

    this.logger.log({
      msg: 'clinic_enrichment_success',
      clinic: input.name,
      servicesCount: validation.data.services?.length ?? 0,
      faqsCount: validation.data.localFaqs.length,
    });

    return validation.data;
  }

  async applyToClinic(clinicId: number, result: ClinicEnrichmentResult): Promise<void> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { sourcePayload: true },
    });
    if (!clinic) {
      throw new BadGatewayException(`Clinic ${clinicId} not found`);
    }

    await this.prisma.clinic.update({
      where: { id: clinicId },
      data: buildApplyData(clinic.sourcePayload, result),
    });

    this.logger.log({ msg: 'clinic_enrichment_applied', clinicId });
  }

  async enrichAndPublish(
    input: ClinicEnrichmentInput,
    clinicId: number,
  ): Promise<EnrichAndPublishResult> {
    const enrichment = await this.enrich(input);
    await this.applyToClinic(clinicId, enrichment);
    await this.clinics.publish(clinicId);

    return {
      clinicId,
      enrichment,
      published: true,
      appliedAt: new Date().toISOString(),
    };
  }
}
