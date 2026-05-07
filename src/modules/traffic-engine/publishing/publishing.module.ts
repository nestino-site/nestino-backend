import { Module } from '@nestjs/common';
import { PublishService } from './publish.service';

@Module({
  providers: [PublishService],
  exports: [PublishService],
})
export class PublishingModule {}
