import { Module } from '@nestjs/common';
import { TrafficEngineBullQueuesModule } from '../traffic-engine-bull.module';
import { ContentTasksModule } from '../content-tasks/content-tasks.module';
import { WebhookRetryProcessor } from '../processors/webhook-retry.processor';
import { PageHeroCdnService } from './page-hero-cdn.service';
import { PublishService } from './publish.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookRetryScheduler } from './webhook-retry.scheduler';
import { ClinicWebhookController } from './clinic-webhook.controller';

@Module({
  imports: [TrafficEngineBullQueuesModule, ContentTasksModule],
  providers: [
    PublishService,
    PageHeroCdnService,
    WebhookDeliveryService,
    WebhookRetryProcessor,
    WebhookRetryScheduler,
  ],
  controllers: [ClinicWebhookController],
  exports: [PublishService, WebhookDeliveryService],
})
export class PublishingModule {}
