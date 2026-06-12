/** Known clinic-type labels → canonical Treatment.code in the database. */
const CLINIC_TYPE_TREATMENT_ALIASES: Record<string, string> = {
  ivf: 'IVF',
  'hair restoration': 'HAIR_RESTORATION',
  'hair transplant': 'HAIR_RESTORATION',
  'hair transplant clinic': 'HAIR_RESTORATION',
  fue: 'HAIR_RESTORATION',
  fut: 'HAIR_RESTORATION',
  'fue hair transplant': 'HAIR_RESTORATION',
  capilar: 'HAIR_RESTORATION',
  'trasplante capilar': 'HAIR_RESTORATION',
};

/** Normalize a human label or slug to a Treatment.code (e.g. "Egg Donation" -> "EGG_DONATION"). */
export function toTreatmentCode(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return '';

  const alias = CLINIC_TYPE_TREATMENT_ALIASES[cleaned.toLowerCase()];
  if (alias) return alias;

  return cleaned
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
}

/** Map a discovery clinicType label to the Treatment.code we should link on publish. */
export function clinicTypeToTreatmentCode(clinicType: string): string {
  return toTreatmentCode(normalizeClinicType(clinicType));
}

export function normalizeClinicType(value: string): string {
  const cleaned = value.trim();
  if (cleaned.toLowerCase() === 'ivf') return 'IVF';
  return cleaned.replace(/-/g, ' ');
}
