import { Module } from '@nestjs/common';
import { SeoStrategyController } from './controllers/seo-strategy.controller';
import { GeoScoringService } from './geo-scoring.service';
import { SchemaMarkupService } from './schema-markup.service';
import { HreflangService } from './hreflang.service';
import { SeoStrategyService } from './seo-strategy.service';

@Module({
  controllers: [SeoStrategyController],
  providers: [SeoStrategyService, GeoScoringService, SchemaMarkupService, HreflangService],
  exports: [SeoStrategyService, GeoScoringService, SchemaMarkupService, HreflangService],
})
export class SeoStrategyModule {}
