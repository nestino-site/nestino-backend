import { Module } from '@nestjs/common';
import { GeoService } from './services/geo.service';
import { GeoController } from './controllers/geo.controller';

@Module({
  providers: [GeoService],
  controllers: [GeoController],
  exports: [GeoService],
})
export class GeoModule {}
