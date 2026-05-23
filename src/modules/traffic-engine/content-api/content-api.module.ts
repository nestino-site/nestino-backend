import { Module } from '@nestjs/common';
import { SeoStrategyModule } from '../seo-strategy/seo-strategy.module';
import { ContentApiController } from './controllers/content-api.controller';
import { ContentCacheService } from './content-cache.service';
import { ContentRenderService } from './content-render.service';
import { ContentStateManagerService } from './content-state-manager.service';
import { MarkdownHtmlService } from './markdown-html.service';
import { NextJsContractMapperService } from './next-js-contract-mapper.service';

@Module({
  imports: [SeoStrategyModule],
  controllers: [ContentApiController],
  providers: [
    ContentStateManagerService,
    ContentCacheService,
    ContentRenderService,
    MarkdownHtmlService,
    NextJsContractMapperService,
  ],
  exports: [
    ContentStateManagerService,
    ContentCacheService,
    ContentRenderService,
    NextJsContractMapperService,
  ],
})
export class ContentApiModule {}
