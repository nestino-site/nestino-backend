/**
 * Local test fixtures for MedCover catalog API integration tests.
 */
import { randomBytes } from 'node:crypto';
import { ClinicStatus, PrismaClient, TruthScoreGrade, TruthScoreStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE_DOMAIN = 'medcover.io';
const API_KEY_PATH = join(__dirname, 'output', 'medcover-test-api-key.txt');

async function main() {
  const prisma = new PrismaClient();
  const apiKey = randomBytes(32).toString('base64url');
  const apiKeyHash = await bcrypt.hash(apiKey, 10);

  try {
    const site = await prisma.site.upsert({
      where: { domain: SITE_DOMAIN },
      create: {
        name: 'MedCover',
        domain: SITE_DOMAIN,
        status: 'ACTIVE',
        publishWebhookUrl: 'http://localhost:3999/webhook',
        publishWebhookSecret: 'test-secret',
      },
      update: {
        contentApiKeyHash: apiKeyHash,
        contentApiKeyCreatedAt: new Date(),
      },
    });

    await prisma.site.update({
      where: { id: site.id },
      data: {
        contentApiKeyHash: apiKeyHash,
        contentApiKeyCreatedAt: new Date(),
      },
    });

    const spain = await prisma.country.findUnique({ where: { codeIso2: 'ES' } });
    const barcelona = await prisma.city.findUnique({ where: { slug: 'barcelona' } });
    const ivf = await prisma.treatment.findUnique({ where: { code: 'IVF' } });

    if (!spain || !barcelona || !ivf) {
      throw new Error('Run prisma db seed first (countries/cities/treatments missing)');
    }

    const clinic = await prisma.clinic.upsert({
      where: { slug: 'instituto-marques' },
      create: {
        slug: 'instituto-marques',
        name: 'Instituto Marqués',
        cityId: barcelona.id,
        countryId: spain.id,
        status: ClinicStatus.PUBLISHED,
        publishedAt: new Date(),
        googleRating: 4.8,
        googleReviewCount: 312,
        editorialSummary: 'Leading fertility clinic in Barcelona.',
        addressLine: 'Carrer del Comte d Urgell 200, Barcelona',
        phone: '+34934500000',
        email: 'info@institutomarques.com',
        websiteUrl: 'https://www.institutomarques.com',
      },
      update: {
        status: ClinicStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    await prisma.clinicTreatment.upsert({
      where: { clinicId_treatmentId: { clinicId: clinic.id, treatmentId: ivf.id } },
      create: { clinicId: clinic.id, treatmentId: ivf.id, isOffered: true },
      update: { isOffered: true },
    });

    await prisma.clinicPricingPackage.deleteMany({ where: { clinicId: clinic.id } });
    await prisma.clinicPricingPackage.create({
      data: {
        clinicId: clinic.id,
        treatmentId: ivf.id,
        packageName: 'IVF Standard Package',
        currency: 'EUR',
        priceMin: 5500,
        priceMax: 7200,
        basePrice: 6500,
        includes: ['Egg retrieval', 'Embryo transfer'],
        excludes: ['ICSI (+€800)'],
        isActive: true,
        lastVerifiedAt: new Date(),
      },
    });

    await prisma.clinicTruthScore.upsert({
      where: { clinicId: clinic.id },
      create: {
        clinicId: clinic.id,
        composite: 84,
        grade: TruthScoreGrade.B,
        interviewCount: 7,
        status: TruthScoreStatus.LIVE,
        dimensionScores: { HIDDEN_COSTS: 75, PRICING_TRANSPARENCY: 80 },
        lastComputedAt: new Date(),
      },
      update: {
        composite: 84,
        grade: TruthScoreGrade.B,
        interviewCount: 7,
        status: TruthScoreStatus.LIVE,
      },
    });

    const greece = await prisma.country.findUnique({ where: { codeIso2: 'GR' } });
    const athens = await prisma.city.findUnique({ where: { slug: 'athens' } });
    if (greece && athens) {
      await prisma.clinic.upsert({
        where: { slug: 'genesis-athens' },
        create: {
          slug: 'genesis-athens',
          name: 'Genesis Athens',
          cityId: athens.id,
          countryId: greece.id,
          status: ClinicStatus.PUBLISHED,
          publishedAt: new Date(),
          googleRating: 4.5,
          googleReviewCount: 120,
        },
        update: { status: ClinicStatus.PUBLISHED },
      });
    }

    mkdirSync(join(__dirname, 'output'), { recursive: true });
    writeFileSync(API_KEY_PATH, `${site.id}\n${apiKey}\n`, 'utf8');

    console.log(JSON.stringify({
      siteId: site.id,
      domain: SITE_DOMAIN,
      apiKeyPath: API_KEY_PATH,
      clinicSlug: clinic.slug,
      publishedClinics: await prisma.clinic.count({ where: { status: 'PUBLISHED' } }),
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
