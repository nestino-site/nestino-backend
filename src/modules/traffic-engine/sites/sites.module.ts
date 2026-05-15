import { Module } from '@nestjs/common';
import { ContentTasksModule } from '../content-tasks/content-tasks.module';
import { SitemapController } from './controllers/sitemap.controller';
import { SitesController } from './controllers/sites.controller';
import { SitemapService } from './sitemap.service';
import { SitesService } from './services/sites.service';

@Module({
  imports: [ContentTasksModule],
  controllers: [SitesController, SitemapController],
  providers: [SitesService, SitemapService],
  exports: [SitesService, SitemapService],
})
export class SitesModule {}
