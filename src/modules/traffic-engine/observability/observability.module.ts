import { Module } from '@nestjs/common';
import { RedisModule } from '../../../common/redis/redis.module';
import { ErrorClassifierService } from './error-classifier.service';
import { ErrorTrackerService } from './error-tracker.service';
import { PipelineMetricsService } from './pipeline-metrics.service';
import { TelegramAlertService } from './telegram-alert.service';

@Module({
  imports: [RedisModule],
  providers: [
    ErrorClassifierService,
    PipelineMetricsService,
    TelegramAlertService,
    ErrorTrackerService,
  ],
  exports: [
    ErrorClassifierService,
    PipelineMetricsService,
    TelegramAlertService,
    ErrorTrackerService,
  ],
})
export class ObservabilityModule {}
