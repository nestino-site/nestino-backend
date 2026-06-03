import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../identity/decorators/public.decorator';
import { SitemapService } from '../sitemap.service';

@ApiTags('Sitemap')
@Controller()
export class SitemapController {
  constructor(private readonly sitemapService: SitemapService) {}

  @Public()
  @Get('sitemap.xml')
  @ApiOperation({ summary: 'Get paginated sitemap XML (by siteId or domain)' })
  @ApiQuery({ name: 'siteId', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'domain', type: String, required: false, example: 'medcover.com' })
  @ApiQuery({ name: 'page', type: Number, required: false, example: 0 })
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
  @ApiOperation({ summary: 'Get sitemap XML for a site' })
  @ApiParam({ name: 'siteId', type: Number, example: 1 })
  @ApiQuery({ name: 'page', type: Number, required: false, example: 0 })
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
  @ApiOperation({ summary: 'Get robots.txt (by siteId or domain)' })
  @ApiQuery({ name: 'siteId', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'domain', type: String, required: false, example: 'medcover.com' })
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
  @ApiOperation({ summary: 'Get robots.txt for a site' })
  @ApiParam({ name: 'siteId', type: Number, example: 1 })
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  async siteRobots(@Param('siteId', ParseIntPipe) siteId: number): Promise<string> {
    return this.sitemapService.buildRobotsTxt(siteId);
  }
}
