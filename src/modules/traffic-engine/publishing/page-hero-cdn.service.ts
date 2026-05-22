import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import { PrismaService } from '../../../common/prisma/prisma.service';

function isCloudinaryConfigured(): boolean {
  return !!process.env.CLOUDINARY_URL?.startsWith('cloudinary://');
}

function initCloudinary(): void {
  // cloudinary.config() picks up CLOUDINARY_URL automatically when it is set
  // in the environment. Calling it once without arguments re-reads the env.
  cloudinary.config();
}

@Injectable()
export class PageHeroCdnService {
  private readonly logger = new Logger(PageHeroCdnService.name);

  constructor(private readonly prisma: PrismaService) {
    if (isCloudinaryConfigured()) {
      initCloudinary();
      this.logger.log('cloudinary_cdn_enabled');
    } else {
      this.logger.warn('cloudinary_cdn_disabled: CLOUDINARY_URL not set');
    }
  }

  /**
   * On publish: convert base64 hero to WebP, upload to Cloudinary,
   * persist generatedImageCdnUrl on the Page row.
   */
  async uploadHeroOnPublish(pageId: number): Promise<string | null> {
    if (!isCloudinaryConfigured()) {
      return null;
    }

    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: { generatedImageBase64: true, generatedImageCdnUrl: true },
    });

    if (!page?.generatedImageBase64) {
      return page?.generatedImageCdnUrl ?? null;
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
      return cdnUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ msg: 'hero_cdn_upload_failed', pageId, error: message });
      return null;
    }
  }

  private uploadToCloudinary(buffer: Buffer, pageId: number): Promise<string> {
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
