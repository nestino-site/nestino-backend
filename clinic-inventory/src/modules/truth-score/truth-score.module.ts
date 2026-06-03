import { Module } from '@nestjs/common';
import { TruthScoreService } from './services/truth-score.service';
import { TruthScoreController } from './controllers/truth-score.controller';

@Module({
  providers: [TruthScoreService],
  controllers: [TruthScoreController],
  exports: [TruthScoreService],
})
export class TruthScoreModule {}
