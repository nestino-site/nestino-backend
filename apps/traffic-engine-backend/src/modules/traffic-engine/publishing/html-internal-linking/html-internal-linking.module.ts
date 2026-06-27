import { Module } from '@nestjs/common';
import { ContentApiModule } from '../../content-api/content-api.module';
import { OpenModelClient } from '../../../clinic-inventory/clinics/enrichment/llm/openmodel.client';
import { LLM_CLIENT } from '../../../clinic-inventory/clinics/enrichment/llm/llm-client.interface';
import { ArticleKeywordExtractorService } from './article-keyword-extractor.service';
import { LinkTargetRepository } from './link-target.repository';
import { HtmlInternalLinkingService } from './html-internal-linking.service';

/**
 * Self-contained module for HTML-level internal linking.
 *
 * Uses the same OpenModel/deepseek-v4-flash client as clinic enrichment
 * (bound via the LLM_CLIENT token) so no new env vars are needed —
 * OPENMODEL_API_KEY + OPENMODEL_MODEL=deepseek-v4-flash are already documented.
 *
 * Exports only HtmlInternalLinkingService so publishing and pages modules
 * have a clean, minimal API surface.
 */
@Module({
  imports: [ContentApiModule],
  providers: [
    {
      provide: LLM_CLIENT,
      useClass: OpenModelClient,
    },
    ArticleKeywordExtractorService,
    LinkTargetRepository,
    HtmlInternalLinkingService,
  ],
  exports: [HtmlInternalLinkingService],
})
export class HtmlInternalLinkingModule {}
