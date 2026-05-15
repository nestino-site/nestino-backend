import { Module } from '@nestjs/common';
import { TrafficEngineBullQueuesModule } from '../traffic-engine-bull.module';
import { WebhookRetryProcessor } from '../processors/webhook-retry.processor';
import { PageHeroCdnService } from './page-hero-cdn.service';
import { PublishService } from './publish.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookRetryScheduler } from './webhook-retry.scheduler';

@Module({
  imports: [TrafficEngineBullQueuesModule],
  providers: [
    PublishService,
    PageHeroCdnService,
    WebhookDeliveryService,
    WebhookRetryProcessor,
    WebhookRetryScheduler,
  ],
  exports: [PublishService, WebhookDeliveryService],
})
export class PublishingModule {}
