import { Module } from '@nestjs/common';
import { MetricsSyncProcessor } from '../processors/metrics-sync.processor';
import { SeoStrategyModule } from '../seo-strategy/seo-strategy.module';
import { AnalyticsIngestionService } from './analytics-ingestion.service';
import { GscIngestionService } from './gsc-ingestion.service';

@Module({
  imports: [SeoStrategyModule],
  providers: [AnalyticsIngestionService, GscIngestionService, MetricsSyncProcessor],
  exports: [AnalyticsIngestionService, GscIngestionService],
})
export class AnalyticsModule {}
