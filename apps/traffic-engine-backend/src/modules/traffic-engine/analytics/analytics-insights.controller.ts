import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ParseIntParam } from '../../../common/pipes/parse-int-param.decorator';
import { GscFeedbackLoopService } from './gsc-feedback-loop.service';
import { TrendScoringService } from './trend-scoring.service';

@ApiTags('Analytics')
@ApiBearerAuth('bearer')
@Controller('analytics')
export class AnalyticsInsightsController {
  constructor(
    private readonly trendScoring: TrendScoringService,
    private readonly gscFeedbackLoop: GscFeedbackLoopService,
  ) {}

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
}
