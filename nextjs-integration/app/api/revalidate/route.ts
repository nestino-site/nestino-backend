/**
 * POST /api/revalidate
 *
 * Called by the Traffic Engine backend (PublishService) whenever a page is
 * published. Verifies the HMAC-SHA256 signature and calls revalidatePath() so
 * the Next.js cache for that slug is cleared immediately.
 *
 * Required env var:
 *   PUBLISH_WEBHOOK_SECRET=<same value stored in Site.publishWebhookSecret>
 *
 * Copy this file to: app/api/revalidate/route.ts in your Next.js project.
 */

import crypto from 'node:crypto';

import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

interface PublishWebhookPayload {
  pageId: string;
  slug: string;
  siteId: string;
  event: 'page.published' | 'page.updated';
  timestamp: number;
}

export async function POST(request: Request): Promise<NextResponse> {
  const signature = request.headers.get('x-publish-signature');
  const rawBody = await request.text();

  if (!signature) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 401 });
  }

  const secret = process.env.PUBLISH_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[revalidate] PUBLISH_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Timing-safe comparison to prevent timing attacks
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let payload: PublishWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as PublishWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // Replay attack guard: reject webhooks older than 5 minutes
  const ageMs = Date.now() - payload.timestamp;
  if (ageMs > 5 * 60 * 1000) {
    return NextResponse.json({ error: 'webhook_expired' }, { status: 400 });
  }

  // Revalidate both the path and the page-id cache tag
  revalidatePath(payload.slug);
  revalidateTag(payload.pageId);

  console.log('[revalidate] cleared', payload.slug, payload.pageId);

  return NextResponse.json({ revalidated: true, slug: payload.slug });
}
