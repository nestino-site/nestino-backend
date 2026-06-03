import { Module } from '@nestjs/common';
import { PerformanceEvaluatorService } from './performance-evaluator.service';

@Module({
  imports: [],
  providers: [PerformanceEvaluatorService],
  exports: [PerformanceEvaluatorService],
})
export class EvaluationModule {}
