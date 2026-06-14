import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PerformanceEvaluatorService } from './performance-evaluator.service';

@Module({
  imports: [AnalyticsModule],
  providers: [PerformanceEvaluatorService],
  exports: [PerformanceEvaluatorService],
})
export class EvaluationModule {}
