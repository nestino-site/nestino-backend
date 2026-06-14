import { Module } from '@nestjs/common';
import { KeywordResearchModule } from '../keyword-research/keyword-research.module';
import { MetricsSyncProcessor } from '../processors/metrics-sync.processor';
import { SeoStrategyModule } from '../seo-strategy/seo-strategy.module';
import { AnalyticsIngestionService } from './analytics-ingestion.service';
import { AnalyticsInsightsController } from './analytics-insights.controller';
import { Ga4IngestionService } from './ga4-ingestion.service';
import { GscFeedbackLoopService } from './gsc-feedback-loop.service';
import { GscIngestionService } from './gsc-ingestion.service';
import { MaturityGateService } from './maturity-gate.service';
import { TrendScoringService } from './trend-scoring.service';

@Module({
  imports: [SeoStrategyModule, KeywordResearchModule],
  providers: [
    AnalyticsIngestionService,
    GscIngestionService,
    Ga4IngestionService,
    MaturityGateService,
    TrendScoringService,
    GscFeedbackLoopService,
    MetricsSyncProcessor,
  ],
  controllers: [AnalyticsInsightsController],
  exports: [
    AnalyticsIngestionService,
    GscIngestionService,
    Ga4IngestionService,
    MaturityGateService,
    TrendScoringService,
    GscFeedbackLoopService,
  ],
})
export class AnalyticsModule {}
