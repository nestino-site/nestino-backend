import { Module } from '@nestjs/common';
import { ErrorClassifierService } from './error-classifier.service';
import { ErrorTrackerService } from './error-tracker.service';
import { PipelineMetricsService } from './pipeline-metrics.service';

@Module({
  providers: [ErrorClassifierService, PipelineMetricsService, ErrorTrackerService],
  exports: [ErrorClassifierService, PipelineMetricsService, ErrorTrackerService],
})
export class ObservabilityModule {}
