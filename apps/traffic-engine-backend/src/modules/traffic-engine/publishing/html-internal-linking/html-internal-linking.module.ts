import { Module } from '@nestjs/common';
import { ContentApiModule } from '../../content-api/content-api.module';
import { ConduitLlmClient } from '../../../clinic-inventory/clinics/enrichment/llm/conduit-llm.client';
import { OpenModelClient } from '../../../clinic-inventory/clinics/enrichment/llm/openmodel.client';
import { LLM_CLIENT } from '../../../clinic-inventory/clinics/enrichment/llm/llm-client.interface';
import { ArticleKeywordExtractorService } from './article-keyword-extractor.service';
import { LinkTargetRepository } from './link-target.repository';
import { HtmlInternalLinkingService } from './html-internal-linking.service';

/**
 * Self-contained module for HTML-level internal linking.
 *
 * The LLM provider is selected by LLM_GATEWAY_PROVIDER env var:
 *   LLM_GATEWAY_PROVIDER=conduit   (default) → ConduitLlmClient (CONDUIT_API_KEY)
 *   LLM_GATEWAY_PROVIDER=openmodel → OpenModelClient (OPENMODEL_API_KEY)
 *
 * Exports only HtmlInternalLinkingService so publishing and pages modules
 * have a clean, minimal API surface.
 */
@Module({
  imports: [ContentApiModule],
  providers: [
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
    ArticleKeywordExtractorService,
    LinkTargetRepository,
    HtmlInternalLinkingService,
  ],
  exports: [HtmlInternalLinkingService],
})
export class HtmlInternalLinkingModule {}
