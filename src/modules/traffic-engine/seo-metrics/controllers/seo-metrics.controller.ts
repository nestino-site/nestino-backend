import { Body, Controller, Get, Post, Query, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UpsertSeoMetricDto } from '../dto/upsert-seo-metric.dto';
import { SeoMetricsService } from '../services/seo-metrics.service';

@ApiTags('SEO Metrics')
@ApiBearerAuth('bearer')
@Controller('seo-metrics')
export class SeoMetricsController {
  constructor(private readonly seoMetricsService: SeoMetricsService) {}

  @Post()
  @ApiOperation({ summary: 'Upsert a single SEO metric row' })
  @ApiResponse({ status: 201, description: 'Metric upserted' })
  upsert(@Body() dto: UpsertSeoMetricDto) {
    return this.seoMetricsService.upsert(dto);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Upsert multiple SEO metric rows' })
  @ApiBody({ type: UpsertSeoMetricDto, isArray: true })
  @ApiResponse({ status: 201, description: 'Metrics upserted' })
  upsertBulk(@Body() dtos: UpsertSeoMetricDto[]) {
    return this.seoMetricsService.upsertMany(dtos);
  }

  @Get()
  @ApiOperation({ summary: 'List SEO metrics for a site' })
  @ApiQuery({ name: 'siteId', type: Number, required: true, example: 1 })
  @ApiQuery({ name: 'days', type: Number, required: false, example: 30 })
  findBySite(@Query('siteId', ParseIntPipe) siteId: number, @Query('days') days?: string) {
    return this.seoMetricsService.findBySite(siteId, days ? Number(days) : 30);
  }
}
