import { Module, forwardRef } from '@nestjs/common';
import { ContentApiModule } from '../content-api/content-api.module';
import { ContentTasksModule } from '../content-tasks/content-tasks.module';
import { WebhookRetryProcessor } from '../processors/webhook-retry.processor';
import { PageHeroCdnService } from './page-hero-cdn.service';
import { PublishService } from './publish.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookRetryScheduler } from './webhook-retry.scheduler';
import { ClinicWebhookController } from './clinic-webhook.controller';
import { ClinicWebhookHandlerService } from './clinic-webhook-handler.service';
import { ClinicPageContentBuilder } from './clinic-page-content.builder';
import { ClinicPhotoCdnService } from './clinic-photo-cdn.service';

@Module({
  imports: [forwardRef(() => ContentTasksModule), forwardRef(() => ContentApiModule)],
  providers: [
    PublishService,
    PageHeroCdnService,
    WebhookDeliveryService,
    WebhookRetryProcessor,
    WebhookRetryScheduler,
    ClinicPageContentBuilder,
    ClinicPhotoCdnService,
    ClinicWebhookHandlerService,
  ],
  controllers: [ClinicWebhookController],
  exports: [PublishService, PageHeroCdnService, WebhookDeliveryService, ClinicWebhookHandlerService],
})
export class PublishingModule {}
