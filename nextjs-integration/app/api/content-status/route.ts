/**
 * GET /api/content-status?pageId=<id>
 *
 * Thin proxy from the Next.js frontend to the backend content API.
 * Used by the useContentStatus hook to poll pipeline progress without
 * exposing the backend URL or credentials to the browser.
 *
 * Required env var:
 *   BACKEND_URL=https://your-backend.com
 *   BACKEND_API_KEY=<optional internal API key>
 *
 * Copy this file to: app/api/content-status/route.ts in your Next.js project.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const pageId = request.nextUrl.searchParams.get('pageId');
  if (!pageId) {
    return NextResponse.json({ error: 'pageId_required' }, { status: 400 });
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (process.env.BACKEND_API_KEY) {
    headers['X-Api-Key'] = process.env.BACKEND_API_KEY;
  }

  const upstream = await fetch(`${backendUrl}/api/v1/content/${pageId}`, {
    headers,
    // Never cache the status response — it changes as the pipeline progresses
    cache: 'no-store',
  });

  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
