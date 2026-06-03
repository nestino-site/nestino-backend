import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import sharp from 'sharp';

const UPLOADS_DIR = process.env.IMAGE_UPLOADS_DIR ?? path.join(process.cwd(), 'uploads');
const MAX_WIDTH = Number(process.env.IMAGE_MAX_WIDTH ?? 1200);
const WEBP_QUALITY = Number(process.env.IMAGE_WEBP_QUALITY ?? 80);

export interface ProcessingResult {
  filePath: string;
  seoFilename: string;
  altText: string;
  width: number;
  height: number;
}

@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);

  async ensureUploadsDir(): Promise<void> {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  }

  /**
   * Process a raw image buffer: resize to maxWidth, convert to WebP, save to uploads dir.
   * Returns metadata about the saved file.
   */
  async process(
    buffer: Buffer,
    subject: string,
    keywords: string[],
  ): Promise<ProcessingResult> {
    await this.ensureUploadsDir();

    const seoFilename = this.buildSeoFilename(subject, keywords);
    const filePath = path.join(UPLOADS_DIR, seoFilename);

    const { width, height } = await sharp(buffer)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(filePath)
      .then((info) => ({ width: info.width, height: info.height }));

    this.logger.log({ msg: 'image_processed', seoFilename, width, height });

    return {
      filePath,
      seoFilename,
      altText: this.buildAltText(subject, keywords),
      width,
      height,
    };
  }

  /**
   * Generate a placeholder 1x1 grey WebP when all image sources fail.
   */
  async generatePlaceholder(subject: string, keywords: string[]): Promise<ProcessingResult> {
    await this.ensureUploadsDir();

    const seoFilename = this.buildSeoFilename(`${subject}-placeholder`, keywords);
    const filePath = path.join(UPLOADS_DIR, seoFilename);

    const { width, height } = await sharp({
      create: { width: 1200, height: 630, channels: 3, background: { r: 220, g: 220, b: 220 } },
    })
      .webp({ quality: 60 })
      .toFile(filePath)
      .then((info) => ({ width: info.width, height: info.height }));

    return {
      filePath,
      seoFilename,
      altText: this.buildAltText(subject, keywords),
      width,
      height,
    };
  }

  buildSeoFilename(subject: string, keywords: string[]): string {
    const parts = [subject, ...keywords.slice(0, 3)]
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);
    return `${parts}.webp`;
  }

  buildAltText(subject: string, keywords: string[]): string {
    const keyStr = keywords.slice(0, 3).join(', ');
    return keyStr ? `${subject} — ${keyStr}` : subject;
  }
}
