import { Prisma } from '@prisma/client';

/** Lightweight fields for GET /pages list — excludes heavy TEXT/base64 columns. */
export const pageListSelect = {
  id: true,
  siteId: true,
  keywordId: true,
  language: true,
  slug: true,
  title: true,
  metaTitle: true,
  metaDescription: true,
  status: true,
  pipelineStatus: true,
  seoScore: true,
  seoCheckScore: true,
  seoCheckPassed: true,
  wordCount: true,
  readabilityScore: true,
  geoScore: true,
  cannibalizationStatus: true,
  optimizationCount: true,
  generatedImageCdnUrl: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PageSelect;

export type PageListItem = Prisma.PageGetPayload<{
  select: typeof pageListSelect;
}>;
