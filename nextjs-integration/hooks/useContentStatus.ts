/**
 * useContentStatus — poll pipeline progress for a given pageId.
 *
 * Usage (inside a client component):
 *   'use client';
 *   import { useContentStatus } from '@/hooks/useContentStatus';
 *
 *   function GeneratingBadge({ pageId }: { pageId: string }) {
 *     const { status, isReady, isFailed, data } = useContentStatus(pageId);
 *     if (isReady) return <span>Live ✓</span>;
 *     if (isFailed) return <span>Failed</span>;
 *     return <span>Generating… ({status})</span>;
 *   }
 *
 * Copy this file to: hooks/useContentStatus.ts in your Next.js project.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type PipelineStatus =
  | 'PENDING'
  | 'GENERATING'
  | 'ANALYZING'
  | 'GEO_SCORING'
  | 'REWRITING'
  | 'READY'
  | 'PUBLISHED'
  | 'FAILED'
  | 'PARTIALLY_COMPLETED'
  | 'SKIPPED_STEP';

export interface ContentStatusData {
  pageId: string;
  slug: string;
  title: string | null;
  metaDescription: string | null;
  pipelineStatus: PipelineStatus;
  geoScore: number | null;
  schemaMarkup: unknown;
  finalContent: string | null;
  publishedAt: string | null;
  httpStatus: number;
}

interface UseContentStatusOptions {
  /** Polling interval in ms. Default 4000. Stops when READY/PUBLISHED/FAILED. */
  intervalMs?: number;
  /** Skip polling if false (e.g. content already published on initial SSR). */
  enabled?: boolean;
}

const TERMINAL_STATUSES: PipelineStatus[] = ['READY', 'PUBLISHED', 'FAILED'];

export function useContentStatus(
  pageId: string | null | undefined,
  options: UseContentStatusOptions = {},
) {
  const { intervalMs = 4000, enabled = true } = options;
  const [data, setData] = useState<ContentStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!pageId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/content-status?pageId=${pageId}`);
      const json = (await res.json()) as ContentStatusData;
      setData(json);
      setError(null);
      // Stop polling once we reach a terminal state
      if (TERMINAL_STATUSES.includes(json.pipelineStatus)) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'poll_failed');
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    if (!pageId || !enabled) return;

    // Immediate first fetch
    void poll();

    timerRef.current = setInterval(() => {
      void poll();
    }, intervalMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [pageId, intervalMs, enabled, poll]);

  return {
    data,
    error,
    loading,
    status: data?.pipelineStatus ?? null,
    isReady: data?.pipelineStatus === 'READY',
    isPublished: data?.pipelineStatus === 'PUBLISHED',
    isFailed: data?.pipelineStatus === 'FAILED',
    isGenerating:
      data !== null && !TERMINAL_STATUSES.includes(data.pipelineStatus),
  };
}
