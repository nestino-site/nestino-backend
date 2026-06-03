import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { SeoStrategyService } from '../seo-strategy.service';

@ApiTags('SEO Strategy')
@ApiBearerAuth('bearer')
@Controller('seo-strategy')
export class SeoStrategyController {
  constructor(private readonly seoStrategyService: SeoStrategyService) {}

  @Get(':siteId/quick-wins')
  @ApiOperation({ summary: 'Find SEO quick-win opportunities for a site' })
  @ApiParam({ name: 'siteId', type: Number, example: 1 })
  findQuickWins(@ParseIntParam('siteId') siteId: number) {
    return this.seoStrategyService.findQuickWins(siteId);
  }

  @Get(':siteId/cannibalization')
  @ApiOperation({ summary: 'Detect keyword cannibalization across pages' })
  @ApiParam({ name: 'siteId', type: Number, example: 1 })
  findCannibalization(@ParseIntParam('siteId') siteId: number) {
    return this.seoStrategyService.findCannibalization(siteId);
  }

  @Get(':siteId/keyword-orphans')
  @ApiOperation({ summary: 'Find keywords without assigned pages' })
  @ApiParam({ name: 'siteId', type: Number, example: 1 })
  findKeywordOrphans(@ParseIntParam('siteId') siteId: number) {
    return this.seoStrategyService.findKeywordOrphans(siteId);
  }

  @Get(':siteId/geo-scores')
  @ApiOperation({ summary: 'Get GEO optimization scores for a site' })
  @ApiParam({ name: 'siteId', type: Number, example: 1 })
  findGeoScores(@ParseIntParam('siteId') siteId: number) {
    return this.seoStrategyService.findGeoScores(siteId);
  }

  @Post(':pageId/generate-schema')
  @ApiOperation({ summary: 'Generate JSON-LD schema markup for a page' })
  @ApiParam({ name: 'pageId', type: Number, example: 100 })
  @ApiResponse({ status: 201, description: 'Schema generated' })
  generateSchema(@ParseIntParam('pageId') pageId: number) {
    return this.seoStrategyService.generateSchemaForPage(pageId);
  }
}
