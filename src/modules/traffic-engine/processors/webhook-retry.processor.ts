import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WebhookDeliveryService } from '../publishing/webhook-delivery.service';
import {
  TRAFFIC_ENGINE_WEBHOOK_JOB_RETRY,
  TRAFFIC_ENGINE_WEBHOOK_QUEUE,
} from '../queue/queue.constants';

@Injectable()
@Processor(TRAFFIC_ENGINE_WEBHOOK_QUEUE)
export class WebhookRetryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookRetryProcessor.name);

  constructor(private readonly webhookDelivery: WebhookDeliveryService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== TRAFFIC_ENGINE_WEBHOOK_JOB_RETRY) {
      return;
    }
    const count = await this.webhookDelivery.processPendingBatch(25);
    this.logger.log({ msg: 'webhook_retry_batch_done', processed: count, jobId: job.id });
  }
}
