import {
  Controller, Get, Put, Patch, Post, Param, Body, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DiscoveryConfigService } from '../services/discovery-config.service';
import {
  PatchPipelineStepDto,
  PatchSystemConfigDto,
  SetCityDiscoveryConfigDto,
} from '../dto/discovery-config.dto';

@ApiTags('Discovery Config')
@Controller('admin')
@ApiBearerAuth()
export class DiscoveryConfigController {
  constructor(private readonly svc: DiscoveryConfigService) {}

  @Get('system-config')
  @ApiOperation({ summary: 'Get system-wide default config' })
  getSystemConfig() {
    return this.svc.getSystemDefaults();
  }

  @Patch('system-config')
  @ApiOperation({ summary: 'Update system-wide defaults (deep merge)' })
  patchSystemConfig(@Body() body: PatchSystemConfigDto) {
    return this.svc.updateSystemDefaults(body as never, 'admin');
  }

  @Get('cities/:cityId/discovery-config')
  @ApiOperation({ summary: 'Get effective config for city (system + city merged)' })
  async getEffectiveConfig(@Param('cityId', ParseIntPipe) cityId: number) {
    const [raw, effective] = await Promise.all([
      this.svc.getCityConfig(cityId).catch(() => null),
      this.svc.getEffectiveConfig(cityId),
    ]);
    return { raw, effective };
  }

  @Put('cities/:cityId/discovery-config')
  @ApiOperation({ summary: 'Replace full city discovery config (bumps version)' })
  setConfig(
    @Param('cityId', ParseIntPipe) cityId: number,
    @Body() body: SetCityDiscoveryConfigDto,
  ) {
    const { pipeline, ...extras } = body;
    return this.svc.setCityConfig(cityId, pipeline, extras as Record<string, unknown>, 'admin');
  }

  @Patch('cities/:cityId/discovery-config/steps/:stepKey')
  @ApiOperation({ summary: 'Quick-patch a single step (e.g. toggle enabled=false)' })
  patchStep(
    @Param('cityId', ParseIntPipe) cityId: number,
    @Param('stepKey') stepKey: string,
    @Body() patch: PatchPipelineStepDto,
  ) {
    return this.svc.patchStep(cityId, stepKey, patch, 'admin');
  }

  @Post('cities/:cityId/discovery-config/rollback/:version')
  @ApiOperation({ summary: 'Rollback city config to a previous version' })
  rollback(
    @Param('cityId', ParseIntPipe) cityId: number,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.svc.rollbackConfig(cityId, version);
  }

  @Get('cities/:cityId/discovery-config/versions')
  @ApiOperation({ summary: 'List all config versions for a city' })
  listVersions(@Param('cityId', ParseIntPipe) cityId: number) {
    return this.svc.listConfigVersions(cityId);
  }
}
