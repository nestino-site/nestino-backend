import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AnalyticsModule } from '../analytics/analytics.module';
import { EvaluationModule } from '../evaluation/evaluation.module';
import { TrafficEngineSchedulerService } from './traffic-engine-scheduler.service';

@Module({
  imports: [AnalyticsModule, EvaluationModule],
  providers: [TrafficEngineSchedulerService],
})
export class SchedulingModule {}
