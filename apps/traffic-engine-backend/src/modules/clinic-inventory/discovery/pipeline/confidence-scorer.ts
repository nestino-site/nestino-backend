export interface ConfidenceInput {
  name: string;
  websiteStatusCode: number;
  hasFertilityTerms: boolean;
  hasAccreditationTerms: boolean;
  businessStatus?: string;
  insidePolygon: boolean;
  searchKeywords: string[];
}

export interface ConfidenceWeights {
  nameMatch: number;
  websiteResolves: number;
  fertilityTerms: number;
  accreditation: number;
  insidePolygon: number;
  operational: number;
}

export interface ConfidenceBreakdown {
  [key: string]: number;
  nameMatch: number;
  websiteResolves: number;
  fertilityTerms: number;
  accreditation: number;
  insidePolygon: number;
  operational: number;
  total: number;
}

const FERTILITY_NAME_TERMS = [
  'ivf', 'fertility', 'fertilidad', 'reproduc', 'ivf', 'fecundacion',
  'embryo', 'clinique', 'gynec', 'ginec', 'assisted reproduction',
  'fertilité', 'reproductif',
];

const HAIR_RESTORATION_NAME_TERMS = [
  'hair transplant', 'hair restoration', 'fue', 'fut', 'dhi',
  'trasplante capilar', 'capilar', 'saç ekimi', 'greffe cheveux',
  'trichology', 'alopecia',
];

export function computeConfidence(
  input: ConfidenceInput,
  weights: ConfidenceWeights,
): ConfidenceBreakdown {
  const nameLower = input.name.toLowerCase();
  const nameHasFertilityTerm =
    FERTILITY_NAME_TERMS.some((t) => nameLower.includes(t)) ||
    HAIR_RESTORATION_NAME_TERMS.some((t) => nameLower.includes(t));
  const nameMatchesKeyword = input.searchKeywords.some((kw) =>
    nameLower.includes(kw.toLowerCase()),
  );
  const nameMatch = nameHasFertilityTerm || nameMatchesKeyword ? 1.0 : 0.3;

  const websiteResolves = input.websiteStatusCode >= 200 && input.websiteStatusCode < 400 ? 1.0 : 0.0;
  const fertilityTerms = input.hasFertilityTerms ? 1.0 : 0.0;
  const accreditation = input.hasAccreditationTerms ? 1.0 : 0.0;
  const insidePolygon = input.insidePolygon ? 1.0 : 0.5;
  const operational = input.businessStatus === 'OPERATIONAL' ? 1.0 : 0.2;

  const total =
    nameMatch * weights.nameMatch +
    websiteResolves * weights.websiteResolves +
    fertilityTerms * weights.fertilityTerms +
    accreditation * weights.accreditation +
    insidePolygon * weights.insidePolygon +
    operational * weights.operational;

  return {
    nameMatch: Math.round(nameMatch * weights.nameMatch * 100) / 100,
    websiteResolves: Math.round(websiteResolves * weights.websiteResolves * 100) / 100,
    fertilityTerms: Math.round(fertilityTerms * weights.fertilityTerms * 100) / 100,
    accreditation: Math.round(accreditation * weights.accreditation * 100) / 100,
    insidePolygon: Math.round(insidePolygon * weights.insidePolygon * 100) / 100,
    operational: Math.round(operational * weights.operational * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}
