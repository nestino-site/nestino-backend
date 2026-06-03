import { Module } from '@nestjs/common';
import { ClinicsService } from './services/clinics.service';
import { ClinicsController } from './controllers/clinics.controller';
import { PublishingModule } from '../publishing/publishing.module';

@Module({
  imports: [PublishingModule],
  providers: [ClinicsService],
  controllers: [ClinicsController],
  exports: [ClinicsService],
})
export class ClinicsModule {}
