import { Controller, Get, Header, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SiteScopedApiKey } from '../../../identity/decorators/site-scoped-api-key.decorator';
import { CatalogService } from './catalog.service';
import { CompareQueryDto } from './dto/compare-query.dto';
import { CostsQueryDto } from './dto/costs-query.dto';
import { ListClinicsQueryDto } from './dto/list-clinics-query.dto';
import { SearchQueryDto } from './dto/search-query.dto';

@ApiTags('Content API — Catalog')
@ApiSecurity('site-api-key')
@Controller('content')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('taxonomy')
  @SiteScopedApiKey()
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiOperation({ summary: 'Taxonomy: countries, cities, treatments with clinic counts' })
  getTaxonomy() {
    return this.catalog.getTaxonomy();
  }

  @Get('clinics')
  @SiteScopedApiKey()
  @ApiOperation({ summary: 'List published clinics with filters and pagination' })
  listClinics(@Query() query: ListClinicsQueryDto) {
    return this.catalog.listClinics(query);
  }

  @Get('clinics/:country/:city/:slug')
  @SiteScopedApiKey()
  @ApiOperation({ summary: 'Full clinic PDP by country/city/slug' })
  getClinicPdp(
    @Param('country') country: string,
    @Param('city') city: string,
    @Param('slug') slug: string,
  ) {
    return this.catalog.getClinicPdp(country, city, slug);
  }

  @Get('search')
  @SiteScopedApiKey()
  @ApiOperation({ summary: 'Search clinics, treatments, countries, cities, guides' })
  search(@Req() req: Request, @Query() query: SearchQueryDto) {
    const siteId = req.siteId ?? 2;
    return this.catalog.search(siteId, query);
  }

  @Get('costs/:treatment')
  @SiteScopedApiKey()
  @ApiOperation({ summary: 'Cost aggregates for a treatment by scope' })
  getCosts(@Param('treatment') treatment: string, @Query() query: CostsQueryDto) {
    return this.catalog.getCosts(treatment, query);
  }

  @Get('compare')
  @SiteScopedApiKey()
  @ApiOperation({ summary: 'Compare clinics, cities, or countries' })
  compare(@Query() query: CompareQueryDto) {
    return this.catalog.compare(query);
  }
}
