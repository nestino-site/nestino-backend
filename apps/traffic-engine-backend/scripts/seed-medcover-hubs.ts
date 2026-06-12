/**
 * Seed published hub CMS pages for MedCover.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-medcover-hubs.ts
 */
import { PageStatus, PipelineStatus, PrismaClient } from '@prisma/client';

const SITE_DOMAIN = process.env.CLINIC_SITE_DOMAIN ?? 'medcover.io';

const HUBS: Array<{
  slug: string;
  pageType: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  faq: Array<{ question: string; answer: string }>;
  heroAnswer: string;
}> = [
  {
    slug: '/clinics',
    pageType: 'clinics_hub',
    title: 'IVF Clinics Directory',
    metaTitle: 'IVF Clinics Abroad — Verified Patient Data | MedCover',
    metaDescription:
      'Browse IVF clinics by country, city, and treatment. Every listing uses verified patient interviews and transparent pricing.',
    heroAnswer:
      'MedCover lists IVF clinics worldwide with verified patient interviews, Google ratings, Truth Scores, and transparent pricing pulled from live clinic data.',
    faq: [
      {
        question: 'How does MedCover verify clinic data?',
        answer:
          'We combine patient interviews, Google Business data, and clinic-published pricing into a Truth Score for each clinic.',
      },
    ],
  },
  {
    slug: '/cost',
    pageType: 'cost_hub',
    title: 'IVF Cost Guides',
    metaTitle: 'IVF Cost Abroad — Real Patient Pricing | MedCover',
    metaDescription:
      'Compare IVF costs by country and city using verified clinic pricing packages and patient-reported totals.',
    heroAnswer:
      'IVF costs abroad vary by country, clinic, and treatment package. MedCover aggregates verified pricing from published clinics.',
    faq: [
      {
        question: 'Are IVF cost figures on MedCover verified?',
        answer:
          'Cost ranges come from clinic pricing packages and patient interviews, with last-verified dates on each package.',
      },
    ],
  },
  {
    slug: '/countries',
    pageType: 'countries_hub',
    title: 'IVF Destinations',
    metaTitle: 'IVF Countries & Destinations | MedCover',
    metaDescription:
      'Explore IVF destinations by country with clinic counts, cost ranges, and patient-verified insights.',
    heroAnswer:
      'MedCover tracks IVF destinations where published clinics offer transparent pricing and verified patient interviews.',
    faq: [
      {
        question: 'Which countries have the most clinics on MedCover?',
        answer:
          'Browse the countries hub for live clinic counts updated when clinics publish or update their profiles.',
      },
    ],
  },
  {
    slug: '/treatments',
    pageType: 'treatments_hub',
    title: 'Fertility Treatments',
    metaTitle: 'IVF & Fertility Treatments Explained | MedCover',
    metaDescription:
      'Learn about IVF, egg donation, and related treatments with MedCover guides and clinic availability by country.',
    heroAnswer:
      'MedCover covers major fertility treatments including IVF, ICSI, egg donation, and embryo transfer with clinic availability by destination.',
    faq: [
      {
        question: 'What treatments does MedCover track?',
        answer:
          'We track treatments offered by published clinics, including IVF, ICSI, egg donation, and related fertility procedures.',
      },
    ],
  },
  {
    slug: '/compare',
    pageType: 'compare_hub',
    title: 'Compare IVF Destinations & Clinics',
    metaTitle: 'Compare IVF Countries, Cities & Clinics | MedCover',
    metaDescription:
      'Side-by-side comparisons of IVF destinations and clinics using verified patient data and pricing.',
    heroAnswer:
      'MedCover compare pages put countries, cities, and clinics side by side using cost, ratings, and Truth Score data.',
    faq: [
      {
        question: 'How are compare pages ordered?',
        answer:
          'Country compare URLs use alphabetical slug order (e.g. greece-vs-spain-for-ivf) for a single canonical URL.',
      },
    ],
  },
  {
    slug: '/guides',
    pageType: 'guides_hub',
    title: 'IVF Guides',
    metaTitle: 'IVF Abroad Guides — Patient-Verified | MedCover',
    metaDescription:
      'Destination guides for IVF abroad with patient interviews, costs, and clinic directories.',
    heroAnswer:
      'MedCover guides combine patient interviews, cost data, and clinic listings for popular IVF destinations worldwide.',
    faq: [
      {
        question: 'How often are guides updated?',
        answer: 'Guides are regenerated when new patient interviews or clinic data change materially.',
      },
    ],
  },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const site = await prisma.site.findUnique({ where: { domain: SITE_DOMAIN } });
    if (!site) throw new Error(`Site ${SITE_DOMAIN} not found`);

    for (const hub of HUBS) {
      let keyword = await prisma.keyword.findFirst({
        where: { siteId: site.id, targetUrl: hub.slug },
      });
      if (!keyword) {
        keyword = await prisma.keyword.create({
          data: {
            siteId: site.id,
            keyword: hub.title,
            language: 'EN',
            intent: 'INFORMATIONAL',
            priority: 5,
            targetUrl: hub.slug,
          },
        });
      }

      const content = `# ${hub.title}\n\n${hub.heroAnswer}`;
      const contentBlocks = [
        { id: 'hero-answer', type: 'hero_answer', data: { text: hub.heroAnswer } },
      ];
      const canonical = `https://${SITE_DOMAIN}${hub.slug}/`;
      const schemaMarkup = [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: hub.title,
          url: canonical,
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${SITE_DOMAIN}/` },
            { '@type': 'ListItem', position: 2, name: hub.title, item: canonical },
          ],
        },
        {
          '@type': 'FAQPage',
          mainEntity: hub.faq.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: { '@type': 'Answer', text: item.answer },
          })),
        },
      ];

      const existing = await prisma.page.findFirst({
        where: { siteId: site.id, slug: hub.slug },
      });

      if (existing) {
        await prisma.page.update({
          where: { id: existing.id },
          data: {
            title: hub.title,
            metaTitle: hub.metaTitle,
            metaDescription: hub.metaDescription,
            pageType: hub.pageType,
            robotsMeta: 'index, follow',
            faq: hub.faq,
            contentBlocks,
            schemaMarkup,
            finalContent: content,
            rawDraft: content,
            pipelineStatus: PipelineStatus.READY,
            status: PageStatus.PUBLISHED,
            publishedAt: existing.publishedAt ?? new Date(),
          },
        });
        console.log(`Updated hub ${hub.slug}`);
      } else {
        await prisma.page.create({
          data: {
            siteId: site.id,
            keywordId: keyword.id,
            language: 'EN',
            slug: hub.slug,
            title: hub.title,
            metaTitle: hub.metaTitle,
            metaDescription: hub.metaDescription,
            pageType: hub.pageType,
            robotsMeta: 'index, follow',
            faq: hub.faq,
            contentBlocks,
            schemaMarkup,
            finalContent: content,
            rawDraft: content,
            pipelineStatus: PipelineStatus.READY,
            status: PageStatus.PUBLISHED,
            publishedAt: new Date(),
          },
        });
        console.log(`Created hub ${hub.slug}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
