import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { DiscoveryConfigService } from './config/services/discovery-config.service';
import { DiscoveryConfigController } from './config/controllers/discovery-config.controller';
import { GooglePlacesAdapter } from './adapters/google-places.adapter';
import { WebsiteFetcherAdapter } from './adapters/website-fetcher.adapter';
import { LlmEnrichmentAdapter } from './adapters/llm-enrichment.adapter';
import { DiscoveryService } from './services/discovery.service';
import { DiscoveryController } from './controllers/discovery.controller';
import { DiscoveryProcessor } from './processors/discovery.processor';
import {
  CLINIC_DISCOVERY_ENRICH_QUEUE,
  CLINIC_DISCOVERY_RUN_QUEUE,
} from '../../common/constants/queue.constants';
import { PublishingModule } from '../publishing/publishing.module';

@Module({
  imports: [
    PublishingModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>('REDIS_URL') },
      }),
    }),
    BullModule.registerQueue(
      { name: CLINIC_DISCOVERY_ENRICH_QUEUE },
      { name: CLINIC_DISCOVERY_RUN_QUEUE },
    ),
  ],
  providers: [
    DiscoveryConfigService,
    GooglePlacesAdapter,
    WebsiteFetcherAdapter,
    LlmEnrichmentAdapter,
    DiscoveryService,
    DiscoveryProcessor,
  ],
  controllers: [DiscoveryConfigController, DiscoveryController],
  exports: [DiscoveryService, DiscoveryConfigService],
})
export class DiscoveryModule {}
