import { Module } from '@nestjs/common';
import { KeywordResearchModule } from '../keyword-research/keyword-research.module';
import { KeywordsController } from './controllers/keywords.controller';
import { KeywordsService } from './services/keywords.service';

@Module({
  imports: [KeywordResearchModule],
  controllers: [KeywordsController],
  providers: [KeywordsService],
  exports: [KeywordsService],
})
export class KeywordsModule {}
