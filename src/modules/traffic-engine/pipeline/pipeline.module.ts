import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../common/prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { SeoBriefBuilder } from '../brief/seo-brief.builder';
import { ContentGenerationPipelineService } from './content-generation-pipeline.service';

@Module({
  imports: [PrismaModule, AiModule],
  providers: [SeoBriefBuilder, ContentGenerationPipelineService],
  exports: [ContentGenerationPipelineService],
})
export class PipelineModule {}
