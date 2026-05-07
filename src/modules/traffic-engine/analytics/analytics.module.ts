import { Module } from '@nestjs/common';
import { MetricsSyncProcessor } from '../processors/metrics-sync.processor';
import { AnalyticsIngestionService } from './analytics-ingestion.service';

@Module({
  imports: [],
  providers: [AnalyticsIngestionService, MetricsSyncProcessor],
  exports: [AnalyticsIngestionService],
})
export class AnalyticsModule {}
