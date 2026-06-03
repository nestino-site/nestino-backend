import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
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
} from '../constants/queue.constants';
import { ClinicPublishModule } from '../clinic-publish.module';

@Module({
  imports: [
    ClinicPublishModule,
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
