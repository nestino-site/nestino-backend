import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ContentTasksModule } from '../content-tasks/content-tasks.module';
import { MaturityController } from './controllers/maturity.controller';
import { SitemapController } from './controllers/sitemap.controller';
import { SitesController } from './controllers/sites.controller';
import { SitemapService } from './sitemap.service';
import { SitesService } from './services/sites.service';

@Module({
  imports: [ContentTasksModule, AnalyticsModule],
  controllers: [SitesController, SitemapController, MaturityController],
  providers: [SitesService, SitemapService],
  exports: [SitesService, SitemapService],
})
export class SitesModule {}
