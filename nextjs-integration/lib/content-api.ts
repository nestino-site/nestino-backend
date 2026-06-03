/**
 * Server-side content fetcher for Next.js Server Components.
 *
 * Fetches content from the backend and caches with a page-level tag so the
 * revalidation webhook can surgically clear just that page.
 *
 * Usage (App Router server component):
 *   import { fetchPageContent } from '@/lib/content-api';
 *
 *   export default async function Page({ params }: { params: { slug: string } }) {
 *     const content = await fetchPageContent(pageId);
 *     return <article dangerouslySetInnerHTML={{ __html: content.finalContent ?? '' }} />;
 *   }
 *
 * Copy this file to: lib/content-api.ts in your Next.js project.
 */

const BACKEND_URL = process.env.BACKEND_URL ?? '';

export interface PageContent {
  pageId: string;
  slug: string;
  title: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  pipelineStatus: string;
  geoScore: number | null;
  schemaMarkup: Record<string, unknown> | null;
  finalContent: string | null;
  publishedAt: string | null;
}

/**
 * Fetch a page's content from the backend.
 * Cached indefinitely and tagged with the pageId; cleared by the revalidation webhook.
 */
export async function fetchPageContent(pageId: string): Promise<PageContent | null> {
  if (!BACKEND_URL) {
    throw new Error('BACKEND_URL environment variable is not set');
  }

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (process.env.BACKEND_API_KEY) {
    headers['X-Api-Key'] = process.env.BACKEND_API_KEY;
  }

  const res = await fetch(`${BACKEND_URL}/api/v1/content/${pageId}`, {
    headers,
    // Cache indefinitely; the revalidation webhook will clear this tag when content is updated
    next: { tags: [pageId, 'content'] },
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Backend returned ${res.status} for page ${pageId}`);
  }

  return res.json() as Promise<PageContent>;
}

/**
 * Fetch multiple pages for a site (e.g. for generating static params).
 * No cache tag needed here — this list rarely changes and is safe to revalidate on a timer.
 */
export async function fetchSitePages(
  siteId: string,
  status = 'PUBLISHED',
): Promise<{ id: string; slug: string }[]> {
  if (!BACKEND_URL) return [];

  const res = await fetch(
    `${BACKEND_URL}/api/v1/pages?siteId=${siteId}&status=${status}`,
    { next: { revalidate: 60 } },
  );

  if (!res.ok) return [];
  return res.json() as Promise<{ id: string; slug: string }[]>;
}
