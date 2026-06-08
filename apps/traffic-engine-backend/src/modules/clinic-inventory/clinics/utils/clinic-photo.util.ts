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

/** Prefer Cloudinary / stored media URLs; fall back to the API photo proxy. */
export function resolveClinicPhotoDisplayUrl(clinic: ClinicPhotoSource): string | null {
  const mediaUrl = clinic.media?.[0]?.url?.trim();
  if (mediaUrl) return mediaUrl;

  const hero = clinic.heroImageUrl?.trim();
  if (hero) return hero;

  if (parseGooglePhotoRef(clinic.googlePhotos) != null) {
    return clinicPhotoProxyUrl(clinic.id);
  }

  return null;
}

export function clinicHasPhoto(clinic: ClinicPhotoSource): boolean {
  if (clinic.heroImageUrl?.trim()) return true;
  if (clinic.media?.[0]?.url?.trim()) return true;
  return parseGooglePhotoRef(clinic.googlePhotos) != null;
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

function parseGooglePhotoRef(
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
