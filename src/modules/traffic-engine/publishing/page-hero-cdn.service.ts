import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import sharp from 'sharp';
import { PrismaService } from '../../../common/prisma/prisma.service';

const UPLOADS_DIR = process.env.IMAGE_UPLOADS_DIR ?? path.join(process.cwd(), 'uploads');
const CDN_BASE = () => process.env.CDN_BASE_URL?.trim().replace(/\/$/, '') ?? '';

@Injectable()
export class PageHeroCdnService {
  private readonly logger = new Logger(PageHeroCdnService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * On publish: convert base64 hero to WebP, save under uploads/pages/{pageId}/hero.webp,
   * persist generatedImageCdnUrl when CDN_BASE_URL is configured.
   */
  async uploadHeroOnPublish(pageId: number): Promise<string | null> {
    const cdnBase = CDN_BASE();
    if (!cdnBase) {
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
      const buffer = Buffer.from(page.generatedImageBase64, 'base64');
      const dir = path.join(UPLOADS_DIR, 'pages', String(pageId));
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, 'hero.webp');

      await sharp(buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(filePath);

      const cdnUrl = `${cdnBase}/pages/${pageId}/hero.webp`;
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
}
