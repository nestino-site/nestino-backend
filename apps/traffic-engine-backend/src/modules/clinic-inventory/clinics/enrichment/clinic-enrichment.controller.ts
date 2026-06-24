import { Controller, Post, Param, ParseIntPipe, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClinicsService } from '../services/clinics.service';
import { ClinicEnrichmentService } from './clinic-enrichment.service';
import { ClinicEnrichmentInput } from './clinic-enrichment.types';

/** Shape of a single Google review entry stored in the `googleReviews` Json field */
interface GoogleReviewEntry {
  text?: string;
  rating?: number;
}

function extractReviewSnippets(googleReviews: unknown): string[] {
  if (!Array.isArray(googleReviews)) return [];
  return (googleReviews as GoogleReviewEntry[])
    .map((r) => (typeof r?.text === 'string' ? r.text.slice(0, 400) : null))
    .filter((t): t is string => t !== null && t.trim().length > 10)
    .slice(0, 5);
}

@ApiTags('Clinics')
@Controller()
export class ClinicEnrichmentController {
  constructor(
    private readonly clinics: ClinicsService,
    private readonly enrichment: ClinicEnrichmentService,
  ) {}

  /**
   * MANUAL ONLY — triggers AI enrichment for a single clinic profile.
   * This endpoint is intentionally NOT called from any automated flow.
   * Returns the enriched content object for admin review; does not persist to DB.
   */
  @Post('clinics/:id/enrich')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate AI enrichment for a clinic profile (admin, manual trigger only)',
    description:
      'Calls OpenModel to produce SEO meta, clinic overview, inferred services, and local FAQs. ' +
      'Returns the result for review — does not modify the clinic record.',
  })
  async enrichClinic(@Param('id', ParseIntPipe) id: number) {
    const clinic = await this.clinics.findByIdAdmin(id);

    if (!clinic.city) {
      throw new NotFoundException(
        `Clinic ${id} has no city assigned. Assign a city before running enrichment.`,
      );
    }

    const country = clinic.city.country ?? clinic.country;
    if (!country) {
      throw new NotFoundException(
        `Clinic ${id} city has no country. Ensure the city is linked to a country before enrichment.`,
      );
    }

    const verifiedTreatments = (clinic.treatments ?? [])
      .filter((ct) => ct.isOffered)
      .map((ct) => ct.treatment.name)
      .filter(Boolean);

    const accreditations = (clinic.accreditations ?? [])
      .map((ca) => ca.accreditation.name)
      .filter(Boolean);

    const input: ClinicEnrichmentInput = {
      name: clinic.name,
      city: clinic.city.name,
      country: country.name,
      // Verified DB fields
      addressLine: clinic.addressLine ?? null,
      phone: clinic.phone ?? clinic.formattedPhone ?? null,
      websiteUrl: clinic.websiteUrl ?? null,
      languages: clinic.languages ?? [],
      foundedYear: clinic.foundedYear ?? null,
      doctorsCount: clinic.doctorsCount ?? null,
      verifiedTreatments,
      accreditations,
      // Google Places fields
      googleMapsUrl: clinic.googleMapsUrl ?? null,
      placeTypes: clinic.placeTypes ?? [],
      editorialSummary: clinic.editorialSummary ?? null,
      googleRating: clinic.googleRating !== null ? Number(clinic.googleRating) : null,
      googleReviewCount: clinic.googleReviewCount ?? null,
      googleReviewSnippets: extractReviewSnippets(clinic.googleReviews),
    };

    return this.enrichment.enrich(input);
  }
}
