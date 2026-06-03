import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { SiteConfigService } from '../site-config.service';
import { UpdateSiteConfigDto, UpsertSiteConfigDto } from '../dto/upsert-site-config.dto';

@ApiTags('Site Config')
@ApiBearerAuth('bearer')
@Controller('site-configs')
export class SiteConfigController {
  constructor(private readonly siteConfigService: SiteConfigService) {}

  @Post()
  @ApiOperation({ summary: 'Create or replace site AI/runtime configuration' })
  @ApiResponse({ status: 201, description: 'Site config upserted' })
  create(@Body() dto: UpsertSiteConfigDto) {
    return this.siteConfigService.upsert(dto);
  }

  @Get(':siteId')
  @ApiOperation({ summary: 'Get site configuration' })
  @ApiParam({ name: 'siteId', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Site config' })
  findOne(@ParseIntParam('siteId') siteId: number) {
    return this.siteConfigService.getForSite(siteId);
  }

  @Patch(':siteId')
  @ApiOperation({ summary: 'Partially update site configuration' })
  @ApiParam({ name: 'siteId', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Updated site config' })
  update(@ParseIntParam('siteId') siteId: number, @Body() dto: UpdateSiteConfigDto) {
    return this.siteConfigService.update(siteId, dto);
  }
}
