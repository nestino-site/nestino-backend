import { Controller, Post, Param, ParseIntPipe, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClinicsService } from '../services/clinics.service';
import { ClinicEnrichmentService } from './clinic-enrichment.service';
import { buildEnrichmentInput } from './clinic-enrichment.mapper';

@ApiTags('Clinics')
@Controller()
export class ClinicEnrichmentController {
  constructor(
    private readonly clinics: ClinicsService,
    private readonly enrichment: ClinicEnrichmentService,
  ) {}

  /**
   * MANUAL ONLY — generates AI enrichment JSON for admin review. Does not persist.
   */
  @Post('clinics/:id/enrich')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate AI enrichment for a clinic profile (preview only)',
    description:
      'Calls OpenModel to produce SEO meta, clinic overview, inferred services, and local FAQs. ' +
      'Returns the result for review — does not modify the clinic record.',
  })
  async enrichClinic(@Param('id', ParseIntPipe) id: number) {
    const clinic = await this.clinics.findByIdAdmin(id);
    if (!clinic.city) {
      throw new NotFoundException(`Clinic ${id} has no city assigned.`);
    }
    const input = buildEnrichmentInput(clinic);
    return this.enrichment.enrich(input);
  }

  /**
   * MANUAL ONLY — enrich, save to clinic record, and publish live pages.
   */
  @Post('clinics/:id/enrich-and-publish')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Enrich clinic profile, apply to DB, and publish (admin, manual only)',
    description:
      'Runs AI enrichment, saves shortDescription/longDescription/aiEnrichment to the clinic, ' +
      'then triggers clinic publish so the live MedCover page is updated.',
  })
  async enrichAndPublishClinic(@Param('id', ParseIntPipe) id: number) {
    const clinic = await this.clinics.findByIdAdmin(id);
    if (!clinic.city) {
      throw new NotFoundException(`Clinic ${id} has no city assigned.`);
    }
    const input = buildEnrichmentInput(clinic);
    return this.enrichment.enrichAndPublish(input, id);
  }
}
