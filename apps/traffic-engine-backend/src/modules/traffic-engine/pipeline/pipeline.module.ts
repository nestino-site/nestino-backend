import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../common/prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { BriefModule } from '../brief/brief.module';
import { ContentGenerationPipelineService } from './content-generation-pipeline.service';

@Module({
  imports: [PrismaModule, AiModule, BriefModule],
  providers: [ContentGenerationPipelineService],
  exports: [ContentGenerationPipelineService],
})
export class PipelineModule {}
