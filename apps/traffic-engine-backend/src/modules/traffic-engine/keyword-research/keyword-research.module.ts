import { Module } from '@nestjs/common';
import { KeywordResearchController } from './controllers/keyword-research.controller';
import { KeywordDataProviderService } from './keyword-data-provider.service';
import { KeywordResearchService } from './services/keyword-research.service';

@Module({
  controllers: [KeywordResearchController],
  providers: [KeywordResearchService, KeywordDataProviderService],
  exports: [KeywordResearchService, KeywordDataProviderService],
})
export class KeywordResearchModule {}
