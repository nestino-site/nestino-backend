import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { getCloudinaryV2, isCloudinaryConfigured } from '../../../common/cloudinary/cloudinary-client';
import { PrismaService } from '../../../common/prisma/prisma.service';

function formatUploadError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const err = error as { message?: string; error?: { message?: string } };
    if (typeof err.message === 'string' && err.message.length > 0) {
      return err.message;
    }
    if (typeof err.error?.message === 'string' && err.error.message.length > 0) {
      return err.error.message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

export interface HeroCdnUploadResult {
  pageId: number;
  uploaded: boolean;
  cdnUrl: string | null;
  skippedReason: string | null;
}

@Injectable()
export class PageHeroCdnService {
  private readonly logger = new Logger(PageHeroCdnService.name);

  constructor(private readonly prisma: PrismaService) {
    if (isCloudinaryConfigured()) {
      getCloudinaryV2();
      this.logger.log('cloudinary_cdn_enabled');
    } else {
      this.logger.warn('cloudinary_cdn_disabled: CLOUDINARY_URL not set or invalid');
    }
  }

  /**
   * On publish: convert base64 hero to WebP, upload to Cloudinary,
   * persist generatedImageCdnUrl on the Page row.
   */
  async uploadHeroOnPublish(pageId: number): Promise<string | null> {
    const result = await this.retryHeroUpload(pageId);
    return result.cdnUrl;
  }

  /**
   * Upload (or re-upload) the stored base64 hero to Cloudinary.
   * Returns structured status for admin retry flows.
   */
  async retryHeroUpload(pageId: number): Promise<HeroCdnUploadResult> {
    if (!isCloudinaryConfigured()) {
      return {
        pageId,
        uploaded: false,
        cdnUrl: null,
        skippedReason: 'cloudinary_not_configured',
      };
    }

    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: { generatedImageBase64: true, generatedImageCdnUrl: true },
    });

    if (!page?.generatedImageBase64) {
      return {
        pageId,
        uploaded: false,
        cdnUrl: page?.generatedImageCdnUrl ?? null,
        skippedReason: 'no_base64_image',
      };
    }

    try {
      const webpBuffer = await sharp(Buffer.from(page.generatedImageBase64, 'base64'))
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      const cdnUrl = await this.uploadToCloudinary(webpBuffer, pageId);

      await this.prisma.page.update({
        where: { id: pageId },
        data: { generatedImageCdnUrl: cdnUrl },
      });

      this.logger.log({ msg: 'hero_cdn_uploaded', pageId, cdnUrl });
      return { pageId, uploaded: true, cdnUrl, skippedReason: null };
    } catch (error) {
      const message = formatUploadError(error);
      this.logger.warn({ msg: 'hero_cdn_upload_failed', pageId, error: message });
      return {
        pageId,
        uploaded: false,
        cdnUrl: null,
        skippedReason: `upload_failed:${message}`,
      };
    }
  }

  private uploadToCloudinary(buffer: Buffer, pageId: number): Promise<string> {
    const cloudinary = getCloudinaryV2();
    return new Promise((resolve, reject) => {
      const publicId = `pages/${pageId}/hero`;
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          overwrite: true,
          resource_type: 'image',
          format: 'webp',
          folder: undefined, // public_id already includes folder path
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
