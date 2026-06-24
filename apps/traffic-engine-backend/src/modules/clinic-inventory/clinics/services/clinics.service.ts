import {
  Injectable, Logger, NotFoundException, ConflictException, Optional, ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { CreateClinicDto } from '../dto/create-clinic.dto';
import { ListClinicsDto } from '../dto/list-clinics.dto';
import { UpsertClinicTreatmentDto } from '../dto/upsert-clinic-treatment.dto';
import { CreatePricingPackageDto } from '../dto/create-pricing-package.dto';
import { ClinicStatus, Prisma } from '@prisma/client';
import { TreatmentSlugGuard } from '../../../../common/guards/treatment-slug.guard';
import { ClinicPublishBridge } from '../../clinic-publish.bridge';
import { ClinicPhotoCdnService } from '../../../traffic-engine/publishing/clinic-photo-cdn.service';
import { resolveClinicPhotoRedirectUrl } from '../utils/clinic-photo.util';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const CLINIC_DETAIL_INCLUDE = {
  city: { include: { country: true } },
  country: true,
  treatments: { include: { treatment: true } },
  accreditations: { include: { accreditation: true } },
  pricingPackages: { where: { isActive: true }, include: { treatment: true } },
  media: { orderBy: { displayOrder: 'asc' as const } },
  doctors: { where: { isActive: true } },
  truthScore: true,
};

@Injectable()
export class ClinicsService {
  private readonly logger = new Logger(ClinicsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly treatmentSlugGuard: TreatmentSlugGuard,
    @Optional() private readonly publishing?: ClinicPublishBridge,
    @Optional() private readonly clinicPhotoCdn?: ClinicPhotoCdnService,
  ) {}

  // ── List / Search ──────────────────────────────────────────────────────────

  async listClinics(query: ListClinicsDto) {
    const { cityId, countryId, treatment, minTruthScore, cursor, limit = 20 } = query;

    const where: Prisma.ClinicWhereInput = { status: 'PUBLISHED' };
    if (cityId) where.cityId = cityId;
    if (countryId) where.countryId = countryId;
    if (treatment) {
      where.treatments = { some: { treatment: { code: treatment.toUpperCase() }, isOffered: true } };
    }
    if (minTruthScore !== undefined) {
      where.truthScore = { composite: { gte: minTruthScore }, status: 'LIVE' };
    }

    const clinics = await this.prisma.clinic.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ truthScore: { composite: 'desc' } }, { id: 'asc' }],
      include: {
        city: { include: { country: { select: { codeIso2: true, name: true } } } },
        media: { where: { isPrimary: true }, take: 1 },
        truthScore: { select: { composite: true, grade: true, status: true, interviewCount: true } },
        _count: { select: { interviews: { where: { status: 'PUBLISHED' } } } },
      },
    });

    const hasNextPage = clinics.length > limit;
    const items = hasNextPage ? clinics.slice(0, -1) : clinics;
    const nextCursor = hasNextPage ? items[items.length - 1].id : null;

    return { items, nextCursor, hasNextPage };
  }

  // ── Single Clinic ──────────────────────────────────────────────────────────

  async findBySlugOrId(identifier: string | number) {
    const where =
      typeof identifier === 'number' || /^\d+$/.test(String(identifier))
        ? { id: Number(identifier) }
        : { slug: String(identifier) };

    const clinic = await this.prisma.clinic.findUnique({
      where,
      include: {
        ...CLINIC_DETAIL_INCLUDE,
        interviews: {
          where: { status: 'PUBLISHED' },
          select: {
            id: true,
            ageBucket: true,
            originCountry: true,
            treatmentCode: true,
            completedYear: true,
            quotes: true,
            publishedAt: true,
          },
          orderBy: { publishedAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!clinic || (clinic.status !== 'PUBLISHED' && !['ADMIN'].includes('ADMIN'))) {
      throw new NotFoundException(`Clinic '${identifier}' not found`);
    }
    return clinic;
  }

  // Full detail including unpublished — admin only
  async findByIdAdmin(id: number) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id },
      include: CLINIC_DETAIL_INCLUDE,
    });
    if (!clinic) throw new NotFoundException(`Clinic ${id} not found`);
    return clinic;
  }

  // ── Create / Update ────────────────────────────────────────────────────────

  async create(dto: CreateClinicDto) {
    const slug = dto.slug ?? slugify(dto.name);
    await this.treatmentSlugGuard.assertNotTreatmentSlug(slug, 'Clinic');
    const data = {
      ...dto,
      slug,
      openingHours: dto.openingHours as Prisma.InputJsonValue | undefined,
      googlePhotos: dto.googlePhotos as Prisma.InputJsonValue | undefined,
      googleReviews: dto.googleReviews as Prisma.InputJsonValue | undefined,
      sourcePayload: dto.sourcePayload as Prisma.InputJsonValue | undefined,
    } as Prisma.ClinicUncheckedCreateInput;
    try {
      return await this.prisma.clinic.create({
        data,
        include: CLINIC_DETAIL_INCLUDE,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Clinic with slug '${slug}' already exists`);
      }
      throw e;
    }
  }

  async update(id: number, dto: Partial<CreateClinicDto>) {
    await this.findByIdAdmin(id);
    if (dto.slug) {
      await this.treatmentSlugGuard.assertNotTreatmentSlug(dto.slug, 'Clinic');
    }
    const data = {
      ...dto,
      openingHours: dto.openingHours as Prisma.InputJsonValue | undefined,
      googlePhotos: dto.googlePhotos as Prisma.InputJsonValue | undefined,
      googleReviews: dto.googleReviews as Prisma.InputJsonValue | undefined,
      sourcePayload: dto.sourcePayload as Prisma.InputJsonValue | undefined,
    } as Prisma.ClinicUncheckedUpdateInput;
    return this.prisma.clinic.update({
      where: { id },
      data,
      include: CLINIC_DETAIL_INCLUDE,
    });
  }

  async getPrimaryPhotoRedirectUrl(id: number): Promise<string | null> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id },
      select: {
        id: true,
        heroImageUrl: true,
        googlePhotos: true,
        media: { where: { isPrimary: true }, take: 1, select: { url: true } },
      },
    });
    if (!clinic) return null;
    return resolveClinicPhotoRedirectUrl(clinic);
  }

  async streamPrimaryPhoto(id: number, res: Response): Promise<void> {
    let url = await this.getPrimaryPhotoRedirectUrl(id);
    if (!url) {
      throw new NotFoundException(`No photo available for clinic ${id}`);
    }

    if (/res\.cloudinary\.com/i.test(url)) {
      res.redirect(302, url);
      return;
    }

    // The resolved URL points to a Google Places Photo API endpoint.
    // Proxying it on every request causes unbounded billed API calls.
    // Attempt a one-time migration to Cloudinary instead.
    if (this.clinicPhotoCdn) {
      try {
        const cdnUrl = await this.clinicPhotoCdn.ensureClinicPhotoOnCdn(id);
        if (cdnUrl && /res\.cloudinary\.com/i.test(cdnUrl)) {
          res.redirect(302, cdnUrl);
          return;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn({ msg: 'clinic_photo_cdn_migration_failed_in_proxy', clinicId: id, error: message });
      }
    }

    // CDN migration unavailable or failed — do NOT fall through to a live Google
    // fetch. Return 404 so no billed API calls are made. Run the backfill script
    // (scripts/backfill-clinic-photo-cdn.ts) to migrate all clinic photos to CDN.
    this.logger.warn({ msg: 'clinic_photo_not_on_cdn', clinicId: id });
    throw new NotFoundException(`Photo not yet on CDN for clinic ${id}`);
  }

  async backfillPhotosToCdn(options?: { ids?: number[]; limit?: number }): Promise<{
    cloudinaryConfigured: boolean;
    processed: number;
    uploaded: number;
    skipped: number;
    failed: number;
    failures: Array<{ clinicId: number; error: string }>;
  }> {
    const cloudinaryConfigured = !!process.env.CLOUDINARY_URL?.startsWith('cloudinary://');
    if (!this.clinicPhotoCdn) {
      throw new ServiceUnavailableException('ClinicPhotoCdnService is not available');
    }
    if (!cloudinaryConfigured) {
      throw new ServiceUnavailableException(
        'CLOUDINARY_URL is not configured on the server. Set it in Railway variables and redeploy.',
      );
    }

    let clinicIds = options?.ids?.filter((id) => id > 0) ?? [];
    if (clinicIds.length === 0) {
      const clinics = await this.prisma.clinic.findMany({
        where: { status: 'PUBLISHED' },
        select: { id: true },
        orderBy: { id: 'asc' },
        ...(options?.limit ? { take: options.limit } : {}),
      });
      clinicIds = clinics.map((c) => c.id);
    } else if (options?.limit) {
      clinicIds = clinicIds.slice(0, options.limit);
    }

    const result = {
      cloudinaryConfigured,
      processed: 0,
      uploaded: 0,
      skipped: 0,
      failed: 0,
      failures: [] as Array<{ clinicId: number; error: string }>,
    };

    for (const clinicId of clinicIds) {
      result.processed++;
      try {
        const before = await this.prisma.clinic.findUnique({
          where: { id: clinicId },
          select: { heroImageUrl: true },
        });
        const hadCloudinary = /res\.cloudinary\.com/i.test(before?.heroImageUrl ?? '');

        const cdnUrl = await this.clinicPhotoCdn.ensureClinicPhotoOnCdn(clinicId);
        if (cdnUrl && /res\.cloudinary\.com/i.test(cdnUrl)) {
          if (hadCloudinary) result.skipped++;
          else result.uploaded++;
        } else {
          result.skipped++;
        }
      } catch (error) {
        result.failed++;
        const message = error instanceof Error ? error.message : String(error);
        result.failures.push({ clinicId, error: message });
        this.logger.error({ msg: 'clinic_photo_backfill_failed', clinicId, error: message });
      }
    }

    this.logger.log({ msg: 'clinic_photo_backfill_complete', ...result, failures: undefined });
    return result;
  }

  async publish(id: number) {
    await this.findByIdAdmin(id);
    const clinic = await this.prisma.clinic.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    this.publishing?.emitClinicPublished(id).catch(() => undefined);
    return clinic;
  }

  async archive(id: number) {
    await this.findByIdAdmin(id);
    return this.prisma.clinic.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }

  async setStatus(id: number, status: ClinicStatus) {
    await this.findByIdAdmin(id);
    return this.prisma.clinic.update({ where: { id }, data: { status } });
  }

  // ── Treatments ─────────────────────────────────────────────────────────────

  async upsertTreatment(clinicId: number, dto: UpsertClinicTreatmentDto) {
    await this.findByIdAdmin(clinicId);
    const treatment = await this.prisma.treatment.findUnique({ where: { code: dto.treatmentCode.toUpperCase() } });
    if (!treatment) throw new NotFoundException(`Treatment '${dto.treatmentCode}' not found`);

    const result = await this.prisma.clinicTreatment.upsert({
      where: { clinicId_treatmentId: { clinicId, treatmentId: treatment.id } },
      create: {
        clinicId,
        treatmentId: treatment.id,
        isOffered: dto.isOffered ?? true,
        notes: dto.notes,
        successRateRange: (dto.successRateRange ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      update: {
        isOffered: dto.isOffered ?? true,
        notes: dto.notes,
        successRateRange: (dto.successRateRange ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      include: { treatment: true },
    });

    if ((dto.isOffered ?? true) && result.clinicId) {
      const clinic = await this.prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { status: true },
      });
      if (clinic?.status === 'PUBLISHED') {
        this.publishing?.emitClinicPublished(clinicId).catch(() => undefined);
      }
    }

    return result;
  }

  async removeTreatment(clinicId: number, treatmentCode: string) {
    const treatment = await this.prisma.treatment.findUnique({ where: { code: treatmentCode.toUpperCase() } });
    if (!treatment) throw new NotFoundException(`Treatment '${treatmentCode}' not found`);
    await this.prisma.clinicTreatment.delete({
      where: { clinicId_treatmentId: { clinicId, treatmentId: treatment.id } },
    });
  }

  // ── Accreditations ─────────────────────────────────────────────────────────

  async upsertAccreditation(clinicId: number, accreditationCode: string, data: { validFrom?: Date; validTo?: Date; certUrl?: string }) {
    await this.findByIdAdmin(clinicId);
    const acc = await this.prisma.accreditation.findUnique({ where: { code: accreditationCode.toUpperCase() } });
    if (!acc) throw new NotFoundException(`Accreditation '${accreditationCode}' not found`);

    return this.prisma.clinicAccreditation.upsert({
      where: { clinicId_accreditationId: { clinicId, accreditationId: acc.id } },
      create: { clinicId, accreditationId: acc.id, ...data },
      update: data,
      include: { accreditation: true },
    });
  }

  // ── Pricing Packages ───────────────────────────────────────────────────────

  async createPricingPackage(clinicId: number, dto: CreatePricingPackageDto) {
    await this.findByIdAdmin(clinicId);
    return this.prisma.clinicPricingPackage.create({
      data: {
        clinicId,
        ...dto,
        includes: dto.includes ?? undefined,
        excludes: dto.excludes ?? undefined,
      },
      include: { treatment: true },
    });
  }

  async updatePricingPackage(clinicId: number, packageId: number, dto: Partial<CreatePricingPackageDto>) {
    const pkg = await this.prisma.clinicPricingPackage.findFirst({ where: { id: packageId, clinicId } });
    if (!pkg) throw new NotFoundException(`Package ${packageId} not found on clinic ${clinicId}`);
    return this.prisma.clinicPricingPackage.update({
      where: { id: packageId },
      data: dto,
      include: { treatment: true },
    });
  }

  // ── Compare ────────────────────────────────────────────────────────────────

  async compareBy(type: 'city' | 'country', aId: number, bId: number) {
    const where = (id: number): Prisma.ClinicWhereInput =>
      type === 'city' ? { cityId: id, status: 'PUBLISHED' } : { countryId: id, status: 'PUBLISHED' };

    const [a, b] = await Promise.all([
      this.prisma.clinic.aggregate({
        where: where(aId),
        _count: { id: true },
        _avg: { googleRating: true },
      }),
      this.prisma.clinic.aggregate({
        where: where(bId),
        _count: { id: true },
        _avg: { googleRating: true },
      }),
    ]);

    return { a: { ...a, id: aId }, b: { ...b, id: bId } };
  }
}
