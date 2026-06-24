import { Module } from '@nestjs/common';
import { ClinicsModule } from '../clinics.module';
import { ClinicEnrichmentService } from './clinic-enrichment.service';
import { ClinicEnrichmentController } from './clinic-enrichment.controller';
import { OpenModelClient } from './llm/openmodel.client';
import { LLM_CLIENT } from './llm/llm-client.interface';

/**
 * Isolated module for manual AI enrichment of clinic profiles.
 * Not imported by any automated pipeline — only wired into ClinicInventoryModule
 * for admin-triggered use via POST /clinics/:id/enrich.
 *
 * To swap the LLM provider: rebind LLM_CLIENT to a different implementation.
 */
@Module({
  imports: [ClinicsModule],
  controllers: [ClinicEnrichmentController],
  providers: [
    ClinicEnrichmentService,
    {
      provide: LLM_CLIENT,
      useClass: OpenModelClient,
    },
  ],
  exports: [ClinicEnrichmentService],
})
export class ClinicEnrichmentModule {}
