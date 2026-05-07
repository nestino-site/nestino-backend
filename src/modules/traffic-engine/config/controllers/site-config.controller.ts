import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { SiteConfigService } from '../site-config.service';
import { UpdateSiteConfigDto, UpsertSiteConfigDto } from '../dto/upsert-site-config.dto';

@Controller('site-configs')
export class SiteConfigController {
  constructor(private readonly siteConfigService: SiteConfigService) {}

  @Post()
  create(@Body() dto: UpsertSiteConfigDto) {
    return this.siteConfigService.upsert(dto);
  }

  @Get(':siteId')
  findOne(@Param('siteId') siteId: string) {
    return this.siteConfigService.getForSite(siteId);
  }

  @Patch(':siteId')
  update(@Param('siteId') siteId: string, @Body() dto: UpdateSiteConfigDto) {
    return this.siteConfigService.update(siteId, dto);
  }
}
