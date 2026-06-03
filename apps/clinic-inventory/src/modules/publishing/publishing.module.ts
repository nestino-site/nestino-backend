import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { PublishingService } from './services/publishing.service';
import { WebhookProcessor } from './services/webhook.processor';
import { PublishingController } from './controllers/publishing.controller';
import { CLINIC_WEBHOOK_QUEUE } from '../../common/constants/queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>('REDIS_URL') },
      }),
    }),
    BullModule.registerQueue({ name: CLINIC_WEBHOOK_QUEUE }),
  ],
  providers: [PublishingService, WebhookProcessor],
  controllers: [PublishingController],
  exports: [PublishingService],
})
export class PublishingModule {}
