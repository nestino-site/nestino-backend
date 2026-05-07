import { Module } from '@nestjs/common';
import { ContentTasksController } from './controllers/content-tasks.controller';
import { ContentTasksService } from './services/content-tasks.service';
import { AiGenerationProcessor } from '../processors/ai-generation.processor';
import { PipelineV3Module } from '../pipeline-v3/pipeline-v3.module';

@Module({
  imports: [PipelineV3Module],
  controllers: [ContentTasksController],
  providers: [ContentTasksService, AiGenerationProcessor],
  exports: [ContentTasksService],
})
export class ContentTasksModule {}
