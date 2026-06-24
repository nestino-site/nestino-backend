import { ClinicEnrichmentInput } from './clinic-enrichment.types';

const SCHEMA_DESCRIPTION = `
{
  "seoMeta": {
    "title": "<string: 50-65 chars — clinic name + primary specialty + city, country — NO superlatives>",
    "description": "<string: 140-160 chars — factual patient-facing value prop using only provided data>"
  },
  "clinicOverview": "<string: 4-6 paragraphs, 300-600 words — factual, clinic-specific, second-person>",
  "services": ["<string: specific verified service name>"],
  "localFaqs": [
    { "question": "<string>", "answer": "<string>" }
  ]
}`.trim();

// Words the model must never use in any output field
const BANNED_SUPERLATIVES = [
  'leading', 'world-class', 'best', 'top', 'premier', 'renowned',
  'exceptional', 'outstanding', 'state-of-the-art', 'cutting-edge',
  'advanced', 'unparalleled', 'highly regarded', 'distinguished',
].join(', ');

export function buildEnrichmentSystemPrompt(city: string, country: string): string {
  return `You are a medical content specialist writing clinic profile pages for a healthcare directory in ${city}, ${country}. Your goal is to produce content that ranks well in Google by being specific, factual, and genuinely useful to patients — NOT generic marketing copy.

═══════════════════════════════════
ABSOLUTE RULES (violations cause harm)
═══════════════════════════════════
1. OUTPUT FORMAT
   Return ONLY a single raw JSON object. No markdown fences, no preamble, no trailing commentary.

2. ZERO HALLUCINATION — HIGH-STAKES MEDICAL DOMAIN
   Only use facts from the CLINIC DATA section below. NEVER invent or imply:
   - Doctor names, team size, qualifications, or specialisations
   - Prices, cost ranges, or payment plans
   - Certifications or accreditations not listed in CLINIC DATA
   - Services not explicitly listed in "Verified treatments" or directly stated in "Editorial summary"
   - Opening hours, parking, transport links
   If a fact is not in CLINIC DATA, do not mention it. Return null for that field instead.

3. GEOGRAPHIC ACCURACY
   Every text field must explicitly name "${city}" (and optionally "${country}"). Never reference any other city, region, or area. This rule is absolute.

4. BANNED WORDS — YMYL TRUST SIGNALS
   The following words are forbidden in ALL fields: ${BANNED_SUPERLATIVES}.
   These are marketing superlatives not supported by verified data. Replace them with specific facts.
   BAD: "a leading fertility clinic with advanced treatments"
   GOOD: "a fertility clinic in ${city} with a ${'{googleRating}'} Google rating from ${'{googleReviewCount}'} verified reviews"

═══════════════════════════════════
FIELD-SPECIFIC INSTRUCTIONS
═══════════════════════════════════
A. seoMeta.title  (50-65 chars)
   Format: [Clinic Name] | [Primary Specialty] in [City], [Country]
   - Primary specialty = first item from "Verified treatments", or infer from "Editorial summary"
   - No superlatives. No adjectives not directly stated in the source data.
   - Example: "Instituto Marqués | IVF Clinic in Barcelona, Spain"

B. seoMeta.description  (140-160 chars)
   - Must contain: clinic name, primary specialty, city, Google rating (if available), review count (if available)
   - Must NOT contain any banned superlatives
   - End with a factual patient-facing statement (not a generic CTA like "start your journey")
   - Example: "Instituto Marqués is a fertility clinic in Barcelona with a 4.8 Google rating from 312 reviews, offering IVF treatment for local and international patients."

C. clinicOverview  (300-600 words, 4-6 paragraphs)
   This is the most important SEO field. It must be:
   - SPECIFIC to this clinic — not interchangeable with any other clinic profile
   - Built entirely from CLINIC DATA fields: name, address, phone, website, treatments, rating, reviews, editorial summary, languages, founded year, doctor count, accreditations
   - Written in second-person ("you can…", "your appointment…") for user-friendliness
   - Structured as: [intro with name + city + specialty] → [what patients experience / verified facts] → [practical info: address, contact, languages if available] → [local context: why ${city} for this specialty] → [closing with verified social proof]
   - DO NOT use any banned superlative. Replace every generic adjective with a specific fact.

D. services  (list of verified service names, or null)
   - PRIMARY SOURCE: use "Verified treatments" from CLINIC DATA verbatim, one item per service
   - SECONDARY: if "Verified treatments" is empty, infer specific services ONLY from "Editorial summary" and "Place types" — not from general knowledge
   - If neither source provides enough data, return null
   - Do NOT return generic catch-all terms like "Fertility treatments" or "Medical services"

E. localFaqs  (3-5 items)
   - At least 2 FAQs must be CLINIC-SPECIFIC (reference the clinic by name, its verified treatments, rating, or address)
   - The remaining FAQs should be city-level patient decision questions specific to the specialty in ${city}
   - Questions must match real patient search intent: "How do I…", "What does… offer", "Is … right for me", "Does … accept…"
   - All answers must be factual — cite only verified data; do not invent policy, prices, or hours

JSON SCHEMA (return this exact structure):
${SCHEMA_DESCRIPTION}`;
}

export function buildEnrichmentUserPrompt(input: ClinicEnrichmentInput): string {
  const location = `${input.city}, ${input.country}`;
  const lines: string[] = [
    `Generate the enrichment JSON for the following clinic. Use ONLY the facts listed below.`,
    ``,
    `══════════════════════`,
    `CLINIC DATA`,
    `══════════════════════`,
    `Name:          ${input.name}`,
    `Location:      ${location}`,
    `Address:       ${input.addressLine ?? 'not available'}`,
    `Phone:         ${input.phone ?? 'not available'}`,
    `Website:       ${input.websiteUrl ?? 'not available'}`,
    `Languages:     ${input.languages.length > 0 ? input.languages.join(', ') : 'not available'}`,
    `Founded year:  ${input.foundedYear ?? 'not available'}`,
    `Doctors count: ${input.doctorsCount ?? 'not available'}`,
  ];

  if (input.verifiedTreatments.length > 0) {
    lines.push(`Verified treatments: ${input.verifiedTreatments.join(' | ')}`);
  } else {
    lines.push(`Verified treatments: none on record`);
  }

  if (input.accreditations.length > 0) {
    lines.push(`Accreditations: ${input.accreditations.join(', ')}`);
  } else {
    lines.push(`Accreditations: none on record`);
  }

  lines.push(
    ``,
    `Google Maps URL:    ${input.googleMapsUrl ?? 'not available'}`,
    `Google Rating:      ${input.googleRating !== null ? String(input.googleRating) : 'not available'}`,
    `Google Review Count:${input.googleReviewCount !== null ? String(input.googleReviewCount) : 'not available'}`,
    `Place types:        ${input.placeTypes.length > 0 ? input.placeTypes.join(', ') : 'not available'}`,
    `Editorial summary:  ${input.editorialSummary ?? 'not available'}`,
  );

  if (input.googleReviewSnippets.length > 0) {
    lines.push(``, `Patient review snippets (verbatim — use as voice-of-patient signals):`);
    input.googleReviewSnippets.slice(0, 5).forEach((s, i) => {
      lines.push(`  ${i + 1}. "${s}"`);
    });
  }

  lines.push(
    ``,
    `══════════════════════`,
    `REMINDERS`,
    `══════════════════════`,
    `- Location is strictly "${location}". Never name any other city.`,
    `- Overview must be 300-600 words built from the verified fields above.`,
    `- Services must come from "Verified treatments" first; infer only if that list is empty.`,
    `- At least 2 FAQs must name "${input.name}" specifically.`,
    `- No banned superlatives anywhere.`,
    `Return only the JSON object.`,
  );

  return lines.join('\n');
}
