import { Module } from '@nestjs/common';
import { SeoMetricsController } from './controllers/seo-metrics.controller';
import { SeoMetricsService } from './services/seo-metrics.service';

@Module({
  controllers: [SeoMetricsController],
  providers: [SeoMetricsService],
  exports: [SeoMetricsService],
})
export class SeoMetricsModule {}
