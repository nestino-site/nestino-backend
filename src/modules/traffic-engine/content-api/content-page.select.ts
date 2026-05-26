import { Prisma } from '@prisma/client';

/** Fields required by NextJsContractMapperService — excludes heavy unused columns. */
export const contentPageSelect = {
  id: true,
  siteId: true,
  slug: true,
  status: true,
  language: true,
  title: true,
  metaTitle: true,
  metaDescription: true,
  publishedAt: true,
  updatedAt: true,
  finalContent: true,
  wordCount: true,
  imagePrompt: true,
  generatedImageCdnUrl: true,
  generatedImageBase64: true,
  htmlContent: true,
  tableOfContents: true,
  faq: true,
  schemaMarkup: true,
  pipelineStatus: true,
  pipelineVersion: true,
  seoScore: true,
  seoCheckScore: true,
  seoCheckPassed: true,
  seoCheckIssues: true,
  readabilityScore: true,
  intentMatch: true,
  contentDepth: true,
  redundancyScore: true,
  geoScore: true,
  contentGaps: true,
  site: {
    select: {
      id: true,
      domain: true,
      languages: true,
    },
  },
  aiGenerationLogs: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      model: true,
      cost: true,
      stepKey: true,
      createdAt: true,
    },
  },
} satisfies Prisma.PageSelect;

export type ContentPageRecord = Prisma.PageGetPayload<{
  select: typeof contentPageSelect;
}>;
