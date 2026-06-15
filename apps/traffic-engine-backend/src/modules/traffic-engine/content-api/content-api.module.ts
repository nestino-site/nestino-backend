import { Module, forwardRef } from '@nestjs/common';
import { SeoStrategyModule } from '../seo-strategy/seo-strategy.module';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { TreatmentSlugGuard } from '../../../common/guards/treatment-slug.guard';
import { ContentBySlugController } from './controllers/content-by-slug.controller';
import { ContentApiController } from './controllers/content-api.controller';
import { ContentCacheService } from './content-cache.service';
import { ContentRenderService } from './content-render.service';
import { ContentStateManagerService } from './content-state-manager.service';
import { MarkdownHtmlService } from './markdown-html.service';
import { NextJsContractMapperService } from './next-js-contract-mapper.service';
import { EntityResolverService } from './seo/entity-resolver.service';
import { PageSeoEnricherService } from './seo/page-seo-enricher.service';
import { SeoSchemaBuilderService } from './seo/seo-schema-builder.service';

@Module({
  imports: [forwardRef(() => SeoStrategyModule)],
  controllers: [CatalogController, ContentApiController, ContentBySlugController],
  providers: [
    CatalogService,
    TreatmentSlugGuard,
    ContentStateManagerService,
    ContentCacheService,
    ContentRenderService,
    MarkdownHtmlService,
    NextJsContractMapperService,
    SeoSchemaBuilderService,
    EntityResolverService,
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
    EntityResolverService,
    PageSeoEnricherService,
  ],
})
export class ContentApiModule {}
