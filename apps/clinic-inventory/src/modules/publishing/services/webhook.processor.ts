import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CLINIC_WEBHOOK_QUEUE } from '../../../common/constants/queue.constants';
import { PublishingService } from './publishing.service';

@Processor(CLINIC_WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly svc: PublishingService) {
    super();
  }

  async process(job: Job<{ deliveryId: number }>): Promise<void> {
    const { deliveryId } = job.data;
    this.logger.debug(`Delivering webhook ${deliveryId}`);
    await this.svc.deliverWebhook(deliveryId);
  }
}
