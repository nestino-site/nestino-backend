import { Module } from '@nestjs/common';
import { ContentTasksModule } from '../content-tasks/content-tasks.module';
import { IdeaTasksController } from './controllers/idea-tasks.controller';
import { IdeaTasksService } from './services/idea-tasks.service';

@Module({
  imports: [ContentTasksModule],
  controllers: [IdeaTasksController],
  providers: [IdeaTasksService],
  exports: [IdeaTasksService],
})
export class IdeaTasksModule {}
