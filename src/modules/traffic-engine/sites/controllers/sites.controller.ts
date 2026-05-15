import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
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
  findOne(@Param('id') id: string) {
    return this.sitesService.findOne(id);
  }

  @Patch(':id/ai-pipeline')
  patchAiPipeline(@Param('id') id: string, @Body() dto: PatchAiPipelineDto) {
    return this.sitesService.patchAiPipeline(id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSiteDto) {
    return this.sitesService.update(id, dto);
  }

  /**
   * Batch-generate content for multiple keywords at once.
   * Creates one page per keyword and enqueues the AI pipeline for each.
   * Skips keywords that already have a page on this site.
   */
  @Post(':id/bulk-generate')
  bulkGenerate(@Param('id') id: string, @Body() dto: BulkGenerateDto) {
    return this.sitesService.bulkGenerate(id, dto);
  }

  /**
   * Generate a new content API key for frontend content reads.
   * The plaintext key is returned once; store it securely.
   */
  @Post(':id/rotate-content-api-key')
  rotateContentApiKey(@Param('id') id: string) {
    return this.sitesService.rotateContentApiKey(id);
  }
}
