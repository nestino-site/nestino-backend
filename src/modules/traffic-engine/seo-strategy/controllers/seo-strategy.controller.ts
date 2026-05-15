import { Controller, Get, Param, Post } from '@nestjs/common';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { SeoStrategyService } from '../seo-strategy.service';

@Controller('seo-strategy')
export class SeoStrategyController {
  constructor(private readonly seoStrategyService: SeoStrategyService) {}

  @Get(':siteId/quick-wins')
  findQuickWins(@ParseIntParam('siteId') siteId: number) {
    return this.seoStrategyService.findQuickWins(siteId);
  }

  @Get(':siteId/cannibalization')
  findCannibalization(@ParseIntParam('siteId') siteId: number) {
    return this.seoStrategyService.findCannibalization(siteId);
  }

  @Get(':siteId/keyword-orphans')
  findKeywordOrphans(@ParseIntParam('siteId') siteId: number) {
    return this.seoStrategyService.findKeywordOrphans(siteId);
  }

  @Get(':siteId/geo-scores')
  findGeoScores(@ParseIntParam('siteId') siteId: number) {
    return this.seoStrategyService.findGeoScores(siteId);
  }

  @Post(':pageId/generate-schema')
  generateSchema(@ParseIntParam('pageId') pageId: number) {
    return this.seoStrategyService.generateSchemaForPage(pageId);
  }
}
