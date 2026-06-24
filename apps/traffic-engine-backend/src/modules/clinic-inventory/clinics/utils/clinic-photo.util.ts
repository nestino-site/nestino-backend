export interface ClinicPhotoSource {
  id: number;
  heroImageUrl?: string | null;
  googlePhotos?: unknown;
  media?: Array<{ url: string }>;
}

export function getApiPublicBaseUrl(): string {
  if (process.env.API_PUBLIC_BASE_URL) {
    return process.env.API_PUBLIC_BASE_URL.replace(/\/$/, '');
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  const port = process.env.PORT ?? '3001';
  return `http://localhost:${port}`;
}

export function clinicPhotoProxyUrl(clinicId: number): string {
  return `${getApiPublicBaseUrl()}/api/v1/clinics/${clinicId}/photo`;
}

/**
 * Returns the display URL for a clinic photo.
 *
 * Only returns Cloudinary / stored media URLs — never the API photo proxy.
 * The proxy hit is a paid Google Places Photo API call; photo URLs must be
 * migrated to Cloudinary via ClinicPhotoCdnService before display.
 */
export function resolveClinicPhotoDisplayUrl(clinic: ClinicPhotoSource): string | null {
  const mediaUrl = clinic.media?.[0]?.url?.trim();
  if (mediaUrl && /res\.cloudinary\.com/i.test(mediaUrl)) return mediaUrl;

  const hero = clinic.heroImageUrl?.trim();
  if (hero && /res\.cloudinary\.com/i.test(hero)) return hero;

  return null;
}

export function clinicHasPhoto(clinic: ClinicPhotoSource): boolean {
  const hero = clinic.heroImageUrl?.trim();
  if (hero && /res\.cloudinary\.com/i.test(hero)) return true;
  const mediaUrl = clinic.media?.[0]?.url?.trim();
  if (mediaUrl && /res\.cloudinary\.com/i.test(mediaUrl)) return true;
  return false;
}

export function resolveClinicPhotoRedirectUrl(clinic: ClinicPhotoSource): string | null {
  const mediaUrl = clinic.media?.[0]?.url?.trim();
  if (mediaUrl) return mediaUrl;

  const hero = clinic.heroImageUrl?.trim();
  if (hero) return hero;

  const googleRef = parseGooglePhotoRef(clinic.googlePhotos);
  if (!googleRef) return null;

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  if (googleRef.kind === 'photo_reference') {
    return (
      `https://maps.googleapis.com/maps/api/place/photo` +
      `?maxwidth=800&photo_reference=${encodeURIComponent(googleRef.value)}` +
      `&key=${encodeURIComponent(apiKey)}`
    );
  }

  const photoName = googleRef.value.startsWith('places/')
    ? googleRef.value
    : `places/${googleRef.value}`;
  return (
    `https://places.googleapis.com/v1/${photoName}/media` +
    `?maxHeightPx=800&maxWidthPx=800&key=${encodeURIComponent(apiKey)}`
  );
}

export function parseGooglePhotoRef(
  raw: unknown,
): { kind: 'photo_reference' | 'name'; value: string } | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0];
  if (!first || typeof first !== 'object') return null;
  const photo = first as Record<string, unknown>;

  if (typeof photo.photo_reference === 'string' && photo.photo_reference.trim()) {
    return { kind: 'photo_reference', value: photo.photo_reference.trim() };
  }
  if (typeof photo.name === 'string' && photo.name.trim()) {
    return { kind: 'name', value: photo.name.trim() };
  }
  return null;
}
