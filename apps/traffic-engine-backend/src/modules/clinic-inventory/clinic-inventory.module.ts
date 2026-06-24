import { Module } from '@nestjs/common';
import { GeoModule } from './geo/geo.module';
import { CatalogModule } from './catalog/catalog.module';
import { ClinicsModule } from './clinics/clinics.module';
import { MediaModule } from './media/media.module';
import { InterviewsModule } from './interviews/interviews.module';
import { TruthScoreModule } from './truth-score/truth-score.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { ClinicPublishModule } from './clinic-publish.module';
import { ClinicEnrichmentModule } from './clinics/enrichment/clinic-enrichment.module';

@Module({
  imports: [
    ClinicPublishModule,
    GeoModule,
    CatalogModule,
    ClinicsModule,
    MediaModule,
    InterviewsModule,
    TruthScoreModule,
    DiscoveryModule,
    ClinicEnrichmentModule,
  ],
  exports: [
    GeoModule,
    CatalogModule,
    ClinicsModule,
    MediaModule,
    InterviewsModule,
    TruthScoreModule,
    DiscoveryModule,
    ClinicPublishModule,
  ],
})
export class ClinicInventoryModule {}
