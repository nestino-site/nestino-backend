import { Controller, Get, Param, Post } from '@nestjs/common';
import { SeoStrategyService } from '../seo-strategy.service';

@Controller('seo-strategy')
export class SeoStrategyController {
  constructor(private readonly seoStrategyService: SeoStrategyService) {}

  @Get(':siteId/quick-wins')
  findQuickWins(@Param('siteId') siteId: string) {
    return this.seoStrategyService.findQuickWins(siteId);
  }

  @Get(':siteId/cannibalization')
  findCannibalization(@Param('siteId') siteId: string) {
    return this.seoStrategyService.findCannibalization(siteId);
  }

  @Get(':siteId/keyword-orphans')
  findKeywordOrphans(@Param('siteId') siteId: string) {
    return this.seoStrategyService.findKeywordOrphans(siteId);
  }

  @Get(':siteId/geo-scores')
  findGeoScores(@Param('siteId') siteId: string) {
    return this.seoStrategyService.findGeoScores(siteId);
  }

  @Post(':pageId/generate-schema')
  generateSchema(@Param('pageId') pageId: string) {
    return this.seoStrategyService.generateSchemaForPage(pageId);
  }
}
