import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { UpsertSeoMetricDto } from '../dto/upsert-seo-metric.dto';
import { SeoMetricsService } from '../services/seo-metrics.service';

@Controller('seo-metrics')
export class SeoMetricsController {
  constructor(private readonly seoMetricsService: SeoMetricsService) {}

  @Post()
  upsert(@Body() dto: UpsertSeoMetricDto) {
    return this.seoMetricsService.upsert(dto);
  }

  @Post('bulk')
  upsertBulk(@Body() dtos: UpsertSeoMetricDto[]) {
    return this.seoMetricsService.upsertMany(dtos);
  }

  @Get()
  findBySite(@Query('siteId') siteId: string, @Query('days') days?: string) {
    return this.seoMetricsService.findBySite(siteId, days ? Number(days) : 30);
  }
}
