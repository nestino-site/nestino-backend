import { Module } from '@nestjs/common';
import { ClinicsModule } from '../clinics.module';
import { ClinicEnrichmentService } from './clinic-enrichment.service';
import { ClinicEnrichmentController } from './clinic-enrichment.controller';
import { ConduitLlmClient } from './llm/conduit-llm.client';
import { OpenModelClient } from './llm/openmodel.client';
import { LLM_CLIENT } from './llm/llm-client.interface';

/**
 * Isolated module for manual AI enrichment of clinic profiles.
 * Not imported by any automated pipeline — only wired into ClinicInventoryModule
 * for admin-triggered use via POST /clinics/:id/enrich.
 *
 * To swap the LLM provider: set LLM_GATEWAY_PROVIDER env var.
 *   LLM_GATEWAY_PROVIDER=conduit   (default) → ConduitLlmClient
 *   LLM_GATEWAY_PROVIDER=openmodel → OpenModelClient
 */
@Module({
  imports: [ClinicsModule],
  controllers: [ClinicEnrichmentController],
  providers: [
    ClinicEnrichmentService,
    ConduitLlmClient,
    OpenModelClient,
    {
      provide: LLM_CLIENT,
      useFactory: (conduit: ConduitLlmClient, openmodel: OpenModelClient) => {
        const provider = (process.env.LLM_GATEWAY_PROVIDER ?? 'conduit').trim().toLowerCase();
        return provider === 'openmodel' ? openmodel : conduit;
      },
      inject: [ConduitLlmClient, OpenModelClient],
    },
  ],
  exports: [ClinicEnrichmentService],
})
export class ClinicEnrichmentModule {}
