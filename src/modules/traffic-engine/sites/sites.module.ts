import { Module } from '@nestjs/common';
import { ContentTasksModule } from '../content-tasks/content-tasks.module';
import { SitesController } from './controllers/sites.controller';
import { SitesService } from './services/sites.service';

@Module({
  imports: [ContentTasksModule],
  controllers: [SitesController],
  providers: [SitesService],
  exports: [SitesService],
})
export class SitesModule {}
