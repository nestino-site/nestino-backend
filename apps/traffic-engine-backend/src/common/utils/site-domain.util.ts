/** Strip protocol/trailing slash and lowercase for domain comparison. */
export function normalizeDomainHost(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/** Apex and www variants plus optional https/http prefixes for DB lookup. */
export function siteDomainLookupVariants(domain: string): string[] {
  const host = normalizeDomainHost(domain);
  const apex = host.replace(/^www\./, '');
  const www = host.startsWith('www.') ? host : `www.${apex}`;

  const hosts = [...new Set([host, apex, www])];
  const variants = new Set<string>();

  for (const h of hosts) {
    variants.add(h);
    variants.add(`https://${h}`);
    variants.add(`http://${h}`);
  }

  return [...variants];
}

/** Canonical public site base URL (https, no trailing slash). */
export function toPublicSiteBaseUrl(domain: string): string {
  const host = normalizeDomainHost(domain);
  return `https://${host}`;
}

/** Prisma `where` clause matching apex/www (and optional protocol-prefixed) domain variants. */
export function siteDomainFindManyWhere(domain: string): { OR: Array<{ domain: string }> } {
  return { OR: siteDomainLookupVariants(domain).map((value) => ({ domain: value })) };
}
