import { Module } from '@nestjs/common';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { SeoBriefBuilder } from './seo-brief.builder';

@Module({
  imports: [IntelligenceModule],
  providers: [SeoBriefBuilder],
  exports: [SeoBriefBuilder],
})
export class BriefModule {}
