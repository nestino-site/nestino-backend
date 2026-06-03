import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { BulkGenerateDto } from '../dto/bulk-generate.dto';
import { CreateSiteDto } from '../dto/create-site.dto';
import { PatchAiPipelineDto } from '../dto/patch-ai-pipeline.dto';
import { UpdateSiteDto } from '../dto/update-site.dto';
import { SitesService } from '../services/sites.service';

@ApiTags('Sites')
@ApiBearerAuth('bearer')
@Controller('sites')
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new site' })
  @ApiResponse({ status: 201, description: 'Site created' })
  create(@Body() dto: CreateSiteDto) {
    return this.sitesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all sites' })
  @ApiResponse({ status: 200, description: 'Site list' })
  findAll() {
    return this.sitesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get site by ID' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  findOne(@ParseIntParam('id') id: number) {
    return this.sitesService.findOne(id);
  }

  @Patch(':id/ai-pipeline')
  @ApiOperation({ summary: 'Update AI pipeline steps for a site' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  patchAiPipeline(@ParseIntParam('id') id: number, @Body() dto: PatchAiPipelineDto) {
    return this.sitesService.patchAiPipeline(id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update site metadata' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  update(@ParseIntParam('id') id: number, @Body() dto: UpdateSiteDto) {
    return this.sitesService.update(id, dto);
  }

  @Post(':id/bulk-generate')
  @ApiOperation({ summary: 'Bulk-generate pages for keyword IDs' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 201, description: 'Bulk generation queued' })
  bulkGenerate(@ParseIntParam('id') id: number, @Body() dto: BulkGenerateDto) {
    return this.sitesService.bulkGenerate(id, dto);
  }

  @Post(':id/rotate-content-api-key')
  @ApiOperation({ summary: 'Rotate the site content API key' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 201, description: 'New API key returned once' })
  rotateContentApiKey(@ParseIntParam('id') id: number) {
    return this.sitesService.rotateContentApiKey(id);
  }
}
