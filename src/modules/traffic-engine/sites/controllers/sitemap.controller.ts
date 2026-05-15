import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { Public } from '../../../identity/decorators/public.decorator';
import { SitemapService } from '../sitemap.service';

@Controller()
export class SitemapController {
  constructor(private readonly sitemapService: SitemapService) {}

  @Public()
  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  async sitemap(
    @Query('siteId', new ParseIntPipe({ optional: true })) siteId?: number,
    @Query('domain') domain?: string,
  ): Promise<string> {
    if (siteId != null) {
      return this.sitemapService.buildXmlForSite(siteId);
    }
    if (domain?.trim()) {
      return this.sitemapService.buildXmlForDomain(domain.trim());
    }
    throw new BadRequestException('Provide siteId or domain query parameter');
  }

  @Public()
  @Get('sites/:siteId/sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  async siteSitemap(@Param('siteId', ParseIntPipe) siteId: number): Promise<string> {
    return this.sitemapService.buildXmlForSite(siteId);
  }
}
