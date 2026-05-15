import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { BulkGenerateDto } from '../dto/bulk-generate.dto';
import { CreateSiteDto } from '../dto/create-site.dto';
import { PatchAiPipelineDto } from '../dto/patch-ai-pipeline.dto';
import { UpdateSiteDto } from '../dto/update-site.dto';
import { SitesService } from '../services/sites.service';

@Controller('sites')
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Post()
  create(@Body() dto: CreateSiteDto) {
    return this.sitesService.create(dto);
  }

  @Get()
  findAll() {
    return this.sitesService.findAll();
  }

  @Get(':id')
  findOne(@ParseIntParam('id') id: number) {
    return this.sitesService.findOne(id);
  }

  @Patch(':id/ai-pipeline')
  patchAiPipeline(@ParseIntParam('id') id: number, @Body() dto: PatchAiPipelineDto) {
    return this.sitesService.patchAiPipeline(id, dto);
  }

  @Patch(':id')
  update(@ParseIntParam('id') id: number, @Body() dto: UpdateSiteDto) {
    return this.sitesService.update(id, dto);
  }

  @Post(':id/bulk-generate')
  bulkGenerate(@ParseIntParam('id') id: number, @Body() dto: BulkGenerateDto) {
    return this.sitesService.bulkGenerate(id, dto);
  }

  @Post(':id/rotate-content-api-key')
  rotateContentApiKey(@ParseIntParam('id') id: number) {
    return this.sitesService.rotateContentApiKey(id);
  }
}
