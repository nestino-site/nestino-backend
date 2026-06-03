import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import {
  TRAFFIC_ENGINE_WEBHOOK_JOB_RETRY,
  TRAFFIC_ENGINE_WEBHOOK_QUEUE,
} from '../queue/queue.constants';

@Injectable()
export class WebhookRetryScheduler {
  private readonly logger = new Logger(WebhookRetryScheduler.name);

  constructor(
    @InjectQueue(TRAFFIC_ENGINE_WEBHOOK_QUEUE)
    private readonly webhookQueue: Queue,
  ) {}

  @Cron(process.env.WEBHOOK_RETRY_CRON ?? '*/5 * * * *')
  async enqueueRetryBatch(): Promise<void> {
    await this.webhookQueue.add(
      TRAFFIC_ENGINE_WEBHOOK_JOB_RETRY,
      {},
      { removeOnComplete: 100, removeOnFail: 50 },
    );
    this.logger.debug({ msg: 'webhook_retry_cron_enqueued' });
  }
}
