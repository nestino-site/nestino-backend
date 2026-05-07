import { Module } from '@nestjs/common';
import { KeywordsController } from './controllers/keywords.controller';
import { KeywordsService } from './services/keywords.service';

@Module({
  controllers: [KeywordsController],
  providers: [KeywordsService],
  exports: [KeywordsService],
})
export class KeywordsModule {}
