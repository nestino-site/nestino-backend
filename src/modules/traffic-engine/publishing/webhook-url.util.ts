/**
 * Normalize webhook URLs before delivery.
 * - Trims whitespace
 * - Ensures trailing slash on path (Next.js App Router routes)
 * - Builds a www-prefixed fallback for apex domains (Vercel often redirects apex → www;
 *   some server-side fetch clients fail on that redirect from Railway)
 */
export function resolveWebhookDeliveryUrl(configuredUrl: string): {
  primaryUrl: string;
  fallbackUrls: string[];
  normalizedFrom: string;
} {
  const normalizedFrom = configuredUrl.trim();
  const primaryUrl = normalizeUrl(normalizedFrom);
  const fallbackUrls: string[] = [];

  try {
    const parsed = new URL(primaryUrl);
    const labels = parsed.hostname.split('.');
    const isApex = labels.length === 2 && labels[0] !== 'www';
    if (isApex) {
      const wwwHost = `www.${parsed.hostname}`;
      const wwwUrl = new URL(primaryUrl);
      wwwUrl.hostname = wwwHost;
      const wwwString = wwwUrl.toString();
      if (wwwString !== primaryUrl) {
        fallbackUrls.push(wwwString);
      }
    }
  } catch {
    // keep primary only
  }

  return { primaryUrl, fallbackUrls, normalizedFrom };
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.length > 1 && !parsed.pathname.endsWith('/')) {
      parsed.pathname += '/';
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function formatFetchError(error: unknown): {
  message: string;
  causeCode?: string;
  causeMessage?: string;
  aborted?: boolean;
} {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  let causeCode: string | undefined;
  let causeMessage: string | undefined;

  if (cause instanceof Error) {
    causeMessage = cause.message;
    if ('code' in cause && typeof cause.code === 'string') {
      causeCode = cause.code;
    }
  } else if (cause && typeof cause === 'object' && 'code' in cause) {
    causeCode = String((cause as { code: unknown }).code);
  }

  const parts = [error.message];
  if (causeCode && !error.message.includes(causeCode)) {
    parts.push(causeCode);
  } else if (causeMessage && !error.message.includes(causeMessage)) {
    parts.push(causeMessage);
  }

  return {
    message: parts.join(' — '),
    causeCode,
    causeMessage,
    aborted: error.name === 'AbortError',
  };
}
