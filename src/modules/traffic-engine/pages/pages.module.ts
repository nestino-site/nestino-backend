import { Module } from '@nestjs/common';
import { ContentApiModule } from '../content-api/content-api.module';
import { ContentTasksModule } from '../content-tasks/content-tasks.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { PipelineV3Module } from '../pipeline-v3/pipeline-v3.module';
import { PublishingModule } from '../publishing/publishing.module';
import { PagesController } from './controllers/pages.controller';
import { PageKeywordService } from './services/page-keyword.service';
import { PagesService } from './services/pages.service';

@Module({
  imports: [
    IntelligenceModule,
    ContentTasksModule,
    PipelineV3Module,
    PublishingModule,
    ContentApiModule,
  ],
  controllers: [PagesController],
  providers: [PagesService, PageKeywordService],
  exports: [PagesService, PageKeywordService],
})
export class PagesModule {}
