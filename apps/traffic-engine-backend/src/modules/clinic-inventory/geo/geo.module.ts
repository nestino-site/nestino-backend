import { Module } from '@nestjs/common';
import { TreatmentSlugGuard } from '../../../common/guards/treatment-slug.guard';
import { GeoService } from './services/geo.service';
import { GeoController } from './controllers/geo.controller';

@Module({
  providers: [GeoService, TreatmentSlugGuard],
  controllers: [GeoController],
  exports: [GeoService],
})
export class GeoModule {}
