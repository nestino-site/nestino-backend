import { Module, forwardRef } from '@nestjs/common';
import { ContentApiModule } from '../content-api/content-api.module';
import { ContentTasksModule } from '../content-tasks/content-tasks.module';
import { ConfigModule } from '../config/config.module';
import { WebhookRetryProcessor } from '../processors/webhook-retry.processor';
import { PageHeroCdnService } from './page-hero-cdn.service';
import { PublishService } from './publish.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookRetryScheduler } from './webhook-retry.scheduler';
import { ClinicWebhookController } from './clinic-webhook.controller';
import { ClinicWebhookHandlerService } from './clinic-webhook-handler.service';
import { ClinicPageContentBuilder } from './clinic-page-content.builder';
import { ClinicPhotoCdnService } from './clinic-photo-cdn.service';
import { HtmlInternalLinkingModule } from './html-internal-linking/html-internal-linking.module';

@Module({
  imports: [
    forwardRef(() => ContentTasksModule),
    forwardRef(() => ContentApiModule),
    ConfigModule,
    HtmlInternalLinkingModule,
  ],
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
  exports: [PublishService, PageHeroCdnService, WebhookDeliveryService, ClinicWebhookHandlerService, ClinicPhotoCdnService],
})
export class PublishingModule {}
