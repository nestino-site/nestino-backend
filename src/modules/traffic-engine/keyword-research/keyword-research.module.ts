import { Module } from '@nestjs/common';
import { KeywordResearchController } from './controllers/keyword-research.controller';
import { KeywordResearchService } from './services/keyword-research.service';

@Module({
  controllers: [KeywordResearchController],
  providers: [KeywordResearchService],
  exports: [KeywordResearchService],
})
export class KeywordResearchModule {}
