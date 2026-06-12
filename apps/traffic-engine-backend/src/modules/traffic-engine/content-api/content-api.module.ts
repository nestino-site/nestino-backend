import { Module } from '@nestjs/common';
import { SeoStrategyModule } from '../seo-strategy/seo-strategy.module';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { TreatmentSlugGuard } from '../../../common/guards/treatment-slug.guard';
import { ContentApiController } from './controllers/content-api.controller';
import { ContentCacheService } from './content-cache.service';
import { ContentRenderService } from './content-render.service';
import { ContentStateManagerService } from './content-state-manager.service';
import { MarkdownHtmlService } from './markdown-html.service';
import { NextJsContractMapperService } from './next-js-contract-mapper.service';
import { PageSeoEnricherService } from './seo/page-seo-enricher.service';
import { SeoSchemaBuilderService } from './seo/seo-schema-builder.service';

@Module({
  imports: [SeoStrategyModule],
  controllers: [CatalogController, ContentApiController],
  providers: [
    CatalogService,
    TreatmentSlugGuard,
    ContentStateManagerService,
    ContentCacheService,
    ContentRenderService,
    MarkdownHtmlService,
    NextJsContractMapperService,
    SeoSchemaBuilderService,
    PageSeoEnricherService,
  ],
  exports: [
    CatalogService,
    TreatmentSlugGuard,
    ContentStateManagerService,
    ContentCacheService,
    ContentRenderService,
    NextJsContractMapperService,
    SeoSchemaBuilderService,
    PageSeoEnricherService,
  ],
})
export class ContentApiModule {}
