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
  @Header('Cache-Control', 'public, max-age=3600')
  async sitemap(
    @Query('siteId', new ParseIntPipe({ optional: true })) siteId?: number,
    @Query('domain') domain?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
  ): Promise<string> {
    if (siteId != null) {
      return this.sitemapService.buildXmlForSite(siteId, page ?? 0);
    }
    if (domain?.trim()) {
      return this.sitemapService.buildXmlForDomain(domain.trim(), page ?? 0);
    }
    throw new BadRequestException('Provide siteId or domain query parameter');
  }

  @Public()
  @Get('sites/:siteId/sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  async siteSitemap(
    @Param('siteId', ParseIntPipe) siteId: number,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
  ): Promise<string> {
    return this.sitemapService.buildXmlForSite(siteId, page ?? 0);
  }

  @Public()
  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  async robots(
    @Query('siteId', new ParseIntPipe({ optional: true })) siteId?: number,
    @Query('domain') domain?: string,
  ): Promise<string> {
    if (siteId != null) {
      return this.sitemapService.buildRobotsTxt(siteId);
    }
    if (domain?.trim()) {
      const resolvedId = await this.sitemapService.getSiteIdByDomain(domain.trim());
      return this.sitemapService.buildRobotsTxt(resolvedId);
    }
    throw new BadRequestException('Provide siteId or domain query parameter');
  }

  @Public()
  @Get('sites/:siteId/robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  async siteRobots(@Param('siteId', ParseIntPipe) siteId: number): Promise<string> {
    return this.sitemapService.buildRobotsTxt(siteId);
  }
}
