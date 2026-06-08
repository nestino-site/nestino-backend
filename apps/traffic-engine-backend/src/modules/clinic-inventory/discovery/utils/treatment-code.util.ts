/** Normalize a human label or slug to a Treatment.code (e.g. "Egg Donation" -> "EGG_DONATION"). */
export function toTreatmentCode(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return '';
  if (cleaned.toLowerCase() === 'ivf') return 'IVF';
  return cleaned
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
}

export function normalizeClinicType(value: string): string {
  const cleaned = value.trim();
  if (cleaned.toLowerCase() === 'ivf') return 'IVF';
  return cleaned.replace(/-/g, ' ');
}
