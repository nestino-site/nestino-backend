import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ParseIntParam } from '../../../common/pipes/parse-int-param.decorator';
import { AnalyticsIngestionService } from './analytics-ingestion.service';
import { GscFeedbackLoopService } from './gsc-feedback-loop.service';
import { GscStrategistService } from './gsc-strategist.service';
import { TrendScoringService } from './trend-scoring.service';

@ApiTags('Analytics')
@ApiBearerAuth('bearer')
@Controller('analytics')
export class AnalyticsInsightsController {
  constructor(
    private readonly trendScoring: TrendScoringService,
    private readonly gscFeedbackLoop: GscFeedbackLoopService,
    private readonly analyticsIngestion: AnalyticsIngestionService,
    private readonly gscStrategist: GscStrategistService,
  ) {}

  @Post(':siteId/gsc-sync')
  @ApiOperation({ summary: 'Pull Google Search Console metrics for a site (on-demand)' })
  @ApiParam({ name: 'siteId', type: Number, example: 1 })
  syncGsc(@ParseIntParam('siteId') siteId: number) {
    return this.analyticsIngestion.syncSiteMetrics(siteId);
  }

  @Get(':siteId/trend-winners')
  @ApiOperation({ summary: 'List GSC queries with rising clicks/impressions or page-1 momentum' })
  @ApiParam({ name: 'siteId', type: Number, example: 1 })
  findTrendWinners(@ParseIntParam('siteId') siteId: number) {
    return this.trendScoring.findWinners(siteId);
  }

  @Get(':siteId/feedback-preview')
  @ApiOperation({
    summary: 'Preview GSC feedback loop seeds (winners + orphans) without creating records',
  })
  @ApiParam({ name: 'siteId', type: Number, example: 1 })
  previewFeedback(@ParseIntParam('siteId') siteId: number) {
    return this.gscFeedbackLoop.previewSeeds(siteId);
  }

  @Get(':siteId/strategist-preview')
  @ApiOperation({
    summary: 'Run LLM GSC strategist and return content opportunities without persisting',
  })
  @ApiParam({ name: 'siteId', type: Number, example: 1 })
  previewStrategist(@ParseIntParam('siteId') siteId: number) {
    return this.gscStrategist.preview(siteId);
  }

  @Post(':siteId/strategist-run')
  @ApiOperation({
    summary: 'Run LLM GSC strategist and persist opportunities as PENDING_REVIEW content ideas',
  })
  @ApiParam({ name: 'siteId', type: Number, example: 1 })
  runStrategist(@ParseIntParam('siteId') siteId: number) {
    return this.gscStrategist.run(siteId);
  }
}
