import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import axios from 'axios';
import sharp from 'sharp';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { resolveClinicPhotoRedirectUrl } from '../../clinic-inventory/clinics/utils/clinic-photo.util';

function isCloudinaryConfigured(): boolean {
  return !!process.env.CLOUDINARY_URL?.startsWith('cloudinary://');
}

function isCloudinaryUrl(url: string): boolean {
  return /res\.cloudinary\.com/i.test(url);
}

@Injectable()
export class ClinicPhotoCdnService {
  private readonly logger = new Logger(ClinicPhotoCdnService.name);

  constructor(private readonly prisma: PrismaService) {
    if (isCloudinaryConfigured()) {
      cloudinary.config();
      this.logger.log('clinic_photo_cdn_enabled');
    } else {
      this.logger.warn('clinic_photo_cdn_disabled: CLOUDINARY_URL not set');
    }
  }

  async ensureClinicPhotoOnCdn(clinicId: number): Promise<string | null> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        slug: true,
        heroImageUrl: true,
        googlePhotos: true,
        media: { where: { isPrimary: true }, take: 1, select: { id: true, url: true } },
      },
    });
    if (!clinic) return null;

    const existing = clinic.heroImageUrl?.trim() || clinic.media[0]?.url?.trim();
    if (existing && isCloudinaryUrl(existing)) {
      return existing;
    }

    if (!isCloudinaryConfigured()) {
      // Surface this clearly — a silent no-op here means every published clinic
      // falls back to the paid Google Places Photo proxy on every page request.
      this.logger.error({
        msg: 'clinic_photo_cdn_misconfigured',
        clinicId,
        detail: 'CLOUDINARY_URL is not set or invalid. Set it to cloudinary://<api_key>:<api_secret>@<cloud_name>. Until fixed, clinic photos cannot be migrated to CDN and the photo proxy will return 404.',
      });
      return null;
    }

    const sourceUrl = resolveClinicPhotoRedirectUrl(clinic);
    if (!sourceUrl) {
      return existing ?? null;
    }

    try {
      const imageRes = await axios.get<ArrayBuffer>(sourceUrl, {
        responseType: 'arraybuffer',
        timeout: 20_000,
        maxRedirects: 5,
      });

      const webpBuffer = await sharp(Buffer.from(imageRes.data))
        .resize({ width: 800, height: 534, fit: 'cover', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      const cdnUrl = await this.uploadToCloudinary(webpBuffer, clinicId);

      await this.prisma.clinic.update({
        where: { id: clinicId },
        data: { heroImageUrl: cdnUrl },
      });

      const primaryMedia = clinic.media[0];
      if (primaryMedia) {
        await this.prisma.clinicMedia.update({
          where: { id: primaryMedia.id },
          data: { url: cdnUrl, isPrimary: true, kind: 'PHOTO' },
        });
      } else {
        await this.prisma.clinicMedia.create({
          data: {
            clinicId,
            url: cdnUrl,
            isPrimary: true,
            kind: 'PHOTO',
            displayOrder: 0,
          },
        });
      }

      this.logger.log({ msg: 'clinic_photo_cdn_uploaded', clinicId, cdnUrl });
      return cdnUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Log as error (not warn) so this surfaces in monitoring dashboards.
      this.logger.error({ msg: 'clinic_photo_cdn_failed', clinicId, error: message });
      return null;
    }
  }

  async ensurePhotosForClinics(clinicIds: number[]): Promise<void> {
    const unique = [...new Set(clinicIds)].filter((id) => id > 0);
    for (const clinicId of unique) {
      await this.ensureClinicPhotoOnCdn(clinicId);
    }
  }

  private uploadToCloudinary(buffer: Buffer, clinicId: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: `clinics/${clinicId}/primary`,
          overwrite: true,
          resource_type: 'image',
          format: 'webp',
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('cloudinary upload returned no result'));
          } else {
            resolve(result.secure_url);
          }
        },
      );
      uploadStream.end(buffer);
    });
  }
}
