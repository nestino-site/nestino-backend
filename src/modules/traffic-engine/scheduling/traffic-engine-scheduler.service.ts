import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { PerformanceEvaluatorService } from '../evaluation/performance-evaluator.service';
import {
  TRAFFIC_ENGINE_ANALYTICS_JOB_SYNC,
  TRAFFIC_ENGINE_ANALYTICS_QUEUE,
} from '../queue/queue.constants';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class TrafficEngineSchedulerService {
  private readonly logger = new Logger(TrafficEngineSchedulerService.name);

  constructor(
    @InjectQueue(TRAFFIC_ENGINE_ANALYTICS_QUEUE)
    private readonly analyticsQueue: Queue<{ siteId?: string }>,
    private readonly prisma: PrismaService,
    private readonly evaluator: PerformanceEvaluatorService,
  ) {}

  @Cron(process.env.METRICS_INGESTION_CRON ?? '0 2 * * *')
  async enqueueMetricsSync(): Promise<void> {
    this.logger.log({ msg: 'cron_metrics_enqueue' });
    await this.analyticsQueue.add(
      TRAFFIC_ENGINE_ANALYTICS_JOB_SYNC,
      {},
      { jobId: 'traffic-engine.metrics.global' },
    );
  }

  @Cron(process.env.PERFORMANCE_EVAL_CRON ?? '0 4 * * *')
  async enqueueEvaluation(): Promise<void> {
    this.logger.log({ msg: 'cron_eval_run' });
    const sites = await this.prisma.site.findMany({ select: { id: true } });
    for (const s of sites) {
      await this.evaluator.evaluateSite(s.id);
    }
  }
}
