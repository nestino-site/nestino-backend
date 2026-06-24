import { Module, forwardRef } from '@nestjs/common';
import { PublishingModule } from '../traffic-engine/publishing/publishing.module';
import { ClinicPublishBridge } from './clinic-publish.bridge';
import { ClinicPublishController } from './clinic-publish.controller';
import { ClinicPhotoCdnService } from '../traffic-engine/publishing/clinic-photo-cdn.service';

@Module({
  imports: [forwardRef(() => PublishingModule)],
  providers: [ClinicPublishBridge],
  controllers: [ClinicPublishController],
  exports: [ClinicPublishBridge, ClinicPhotoCdnService],
})
export class ClinicPublishModule {}
