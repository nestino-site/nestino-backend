import { Module } from '@nestjs/common';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { KeywordResearchModule } from '../keyword-research/keyword-research.module';
import { SeoBriefBuilder } from './seo-brief.builder';

@Module({
  imports: [IntelligenceModule, KeywordResearchModule],
  providers: [SeoBriefBuilder],
  exports: [SeoBriefBuilder],
})
export class BriefModule {}
