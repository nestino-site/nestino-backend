/**
 * One-off backfill: upload stored base64 hero images to Cloudinary.
 *
 * Usage (production DB from Railway dashboard):
 *   DATABASE_URL="postgresql://..." \
 *   CLOUDINARY_URL="cloudinary://key:secret@cloud_name" \
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-hero-cdn.ts [pageId...]
 *
 * With no page IDs, processes all pages that have base64 but no CDN URL.
 */
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function uploadToCloudinary(buffer: Buffer, pageId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: `pages/${pageId}/hero`,
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

async function backfillPage(pageId: number): Promise<void> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { id: true, generatedImageBase64: true, generatedImageCdnUrl: true },
  });

  if (!page) {
    console.log(`page ${pageId}: not found`);
    return;
  }
  if (!page.generatedImageBase64) {
    console.log(`page ${pageId}: no base64 — skip`);
    return;
  }
  if (page.generatedImageCdnUrl) {
    console.log(`page ${pageId}: already has CDN URL — ${page.generatedImageCdnUrl}`);
    return;
  }

  const webpBuffer = await sharp(Buffer.from(page.generatedImageBase64, 'base64'))
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const cdnUrl = await uploadToCloudinary(webpBuffer, pageId);
  await prisma.page.update({
    where: { id: pageId },
    data: { generatedImageCdnUrl: cdnUrl },
  });
  console.log(`page ${pageId}: uploaded → ${cdnUrl}`);
}

async function main(): Promise<void> {
  requireEnv('DATABASE_URL');
  const cloudinaryUrl = requireEnv('CLOUDINARY_URL');
  if (!cloudinaryUrl.startsWith('cloudinary://')) {
    throw new Error('CLOUDINARY_URL must start with cloudinary://');
  }
  cloudinary.config();

  const ids = process.argv.slice(2).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);

  if (ids.length > 0) {
    for (const pageId of ids) {
      await backfillPage(pageId);
    }
    return;
  }

  const pages = await prisma.page.findMany({
    where: {
      generatedImageBase64: { not: null },
      generatedImageCdnUrl: null,
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  if (pages.length === 0) {
    console.log('No pages need backfill.');
    return;
  }

  console.log(`Backfilling ${pages.length} page(s)...`);
  for (const page of pages) {
    await backfillPage(page.id);
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
