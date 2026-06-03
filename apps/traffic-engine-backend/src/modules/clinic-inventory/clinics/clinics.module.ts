import { Module } from '@nestjs/common';
import { ClinicsService } from './services/clinics.service';
import { ClinicsController } from './controllers/clinics.controller';
import { ClinicPublishModule } from '../clinic-publish.module';

@Module({
  imports: [ClinicPublishModule],
  providers: [ClinicsService],
  controllers: [ClinicsController],
  exports: [ClinicsService],
})
export class ClinicsModule {}
