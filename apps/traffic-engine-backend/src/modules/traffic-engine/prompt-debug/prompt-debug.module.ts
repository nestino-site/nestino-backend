import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ConfigModule } from '../config/config.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { PromptDebugController } from './prompt-debug.controller';
import { PromptDebugService } from './prompt-debug.service';

@Module({
  imports: [AiModule, ConfigModule, IntelligenceModule],
  controllers: [PromptDebugController],
  providers: [PromptDebugService],
})
export class PromptDebugModule {}
