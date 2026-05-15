import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SubjectsModule } from '../subjects/subjects.module';
import { ContentIdeasController } from './controllers/content-ideas.controller';
import { IdeaGenerationService } from './idea-generation/idea-generation.service';
import { IdeaValidationService } from './idea-validation.service';
import { IdeaGenerationProcessor } from '../processors/idea-generation.processor';
import { ContentIdeasService } from './services/content-ideas.service';

@Module({
  imports: [AiModule, SubjectsModule],
  controllers: [ContentIdeasController],
  providers: [
    ContentIdeasService,
    IdeaGenerationService,
    IdeaValidationService,
    IdeaGenerationProcessor,
  ],
  exports: [ContentIdeasService, IdeaGenerationService, IdeaValidationService],
})
export class ContentIdeasModule {}
