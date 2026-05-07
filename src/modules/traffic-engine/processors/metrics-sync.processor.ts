import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AnalyticsIngestionService } from '../analytics/analytics-ingestion.service';
import { TRAFFIC_ENGINE_ANALYTICS_JOB_SYNC, TRAFFIC_ENGINE_ANALYTICS_QUEUE } from '../queue/queue.constants';

@Injectable()
@Processor(TRAFFIC_ENGINE_ANALYTICS_QUEUE)
export class MetricsSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MetricsSyncProcessor.name);

  constructor(private readonly analytics: AnalyticsIngestionService) {
    super();
  }

  async process(job: Job<{ siteId?: string }>): Promise<void> {
    if (job.name !== TRAFFIC_ENGINE_ANALYTICS_JOB_SYNC) {
      return;
    }
    this.logger.log({ msg: 'metrics_sync_start', jobId: job.id });
    if (job.data.siteId) {
      await this.analytics.syncSiteMetrics(job.data.siteId);
    } else {
      await this.analytics.syncAllSites();
    }
    this.logger.log({ msg: 'metrics_sync_done', jobId: job.id });
  }
}
