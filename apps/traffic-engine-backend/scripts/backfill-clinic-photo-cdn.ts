/**
 * One-off backfill: upload clinic Google photos to Cloudinary and republish pages.
 *
 * Usage (production DB from Railway dashboard):
 *   DATABASE_URL="postgresql://..." \
 *   CLOUDINARY_URL="cloudinary://key:secret@cloud_name" \
 *   GOOGLE_PLACES_API_KEY="..." \
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-clinic-photo-cdn.ts [clinicId...]
 *
 * With no clinic IDs, processes all published clinics that have googlePhotos but no Cloudinary hero.
 */
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import axios from 'axios';
import sharp from 'sharp';
import { resolveClinicPhotoRedirectUrl } from '../src/modules/clinic-inventory/clinics/utils/clinic-photo.util';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function isCloudinaryUrl(url: string): boolean {
  return /res\.cloudinary\.com/i.test(url);
}

async function uploadToCloudinary(buffer: Buffer, clinicId: number): Promise<string> {
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

async function backfillClinic(clinicId: number): Promise<'done' | 'skip' | 'error'> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: {
      id: true,
      slug: true,
      name: true,
      heroImageUrl: true,
      googlePhotos: true,
      media: { where: { isPrimary: true }, take: 1, select: { id: true, url: true } },
    },
  });

  if (!clinic) {
    console.log(`clinic ${clinicId}: not found`);
    return 'skip';
  }

  const existing = clinic.heroImageUrl?.trim() || clinic.media[0]?.url?.trim();
  if (existing && isCloudinaryUrl(existing)) {
    console.log(`clinic ${clinicId} (${clinic.name}): already on CDN — skip`);
    return 'skip';
  }

  const sourceUrl = resolveClinicPhotoRedirectUrl(clinic);
  if (!sourceUrl) {
    console.log(`clinic ${clinicId} (${clinic.name}): no photo source — skip`);
    return 'skip';
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

    const cdnUrl = await uploadToCloudinary(webpBuffer, clinicId);

    await prisma.clinic.update({
      where: { id: clinicId },
      data: { heroImageUrl: cdnUrl },
    });

    const primaryMedia = clinic.media[0];
    if (primaryMedia) {
      await prisma.clinicMedia.update({
        where: { id: primaryMedia.id },
        data: { url: cdnUrl, isPrimary: true, kind: 'PHOTO' },
      });
    } else {
      await prisma.clinicMedia.create({
        data: {
          clinicId,
          url: cdnUrl,
          isPrimary: true,
          kind: 'PHOTO',
          displayOrder: 0,
        },
      });
    }

    console.log(`clinic ${clinicId} (${clinic.name}): uploaded → ${cdnUrl}`);
    return 'done';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`clinic ${clinicId} (${clinic.name}): ERROR — ${message}`);
    return 'error';
  }
}

async function main(): Promise<void> {
  requireEnv('DATABASE_URL');
  requireEnv('GOOGLE_PLACES_API_KEY');
  const cloudinaryUrl = requireEnv('CLOUDINARY_URL');
  if (!cloudinaryUrl.startsWith('cloudinary://')) {
    throw new Error('CLOUDINARY_URL must start with cloudinary://');
  }
  cloudinary.config();

  const ids = process.argv
    .slice(2)
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  let clinicIds: number[];

  if (ids.length > 0) {
    clinicIds = ids;
  } else {
    // Query ALL published clinics — the per-clinic check skips ones already on Cloudinary.
    // Previously this only fetched clinics with a null heroImageUrl, missing clinics whose
    // heroImageUrl was set to a non-Cloudinary URL (e.g. a stale Google redirect URL).
    const clinics = await prisma.clinic.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    if (clinics.length === 0) {
      console.log('No published clinics found.');
      return;
    }
    clinicIds = clinics.map((c) => c.id);
  }

  console.log(`Processing ${clinicIds.length} clinic(s)...`);
  const stats = { done: 0, skip: 0, error: 0 };

  for (const clinicId of clinicIds) {
    const result = await backfillClinic(clinicId);
    stats[result]++;
  }

  console.log(`\nDone. uploaded=${stats.done}  skipped=${stats.skip}  errors=${stats.error}`);
  if (stats.error > 0) {
    process.exitCode = 1;
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
