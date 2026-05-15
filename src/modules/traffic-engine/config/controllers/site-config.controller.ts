import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
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
  findOne(@ParseIntParam('siteId') siteId: number) {
    return this.siteConfigService.getForSite(siteId);
  }

  @Patch(':siteId')
  update(@ParseIntParam('siteId') siteId: number, @Body() dto: UpdateSiteConfigDto) {
    return this.siteConfigService.update(siteId, dto);
  }
}
