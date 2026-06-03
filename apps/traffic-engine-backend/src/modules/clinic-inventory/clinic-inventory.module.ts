import { Module } from '@nestjs/common';
import { GeoModule } from './geo/geo.module';
import { CatalogModule } from './catalog/catalog.module';
import { ClinicsModule } from './clinics/clinics.module';
import { MediaModule } from './media/media.module';
import { InterviewsModule } from './interviews/interviews.module';
import { TruthScoreModule } from './truth-score/truth-score.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { ClinicPublishModule } from './clinic-publish.module';

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
