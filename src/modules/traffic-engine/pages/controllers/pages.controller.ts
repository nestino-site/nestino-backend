import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  NotFoundException,
  UnprocessableEntityException,
  ParseIntPipe,
} from '@nestjs/common';
import { ContentLanguage, PageStatus } from '@prisma/client';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { ContentTasksService } from '../../content-tasks/services/content-tasks.service';
import { PipelineCheckpointService } from '../../pipeline-v3/pipeline-checkpoint.service';
import { PublishService } from '../../publishing/publish.service';
import { AssignPageKeywordDto } from '../dto/assign-page-keyword.dto';
import { CreatePageDto } from '../dto/create-page.dto';
import { UpdatePageDto } from '../dto/update-page.dto';
import { PageKeywordService } from '../services/page-keyword.service';
import { PagesService } from '../services/pages.service';

@Controller('pages')
export class PagesController {
  constructor(
    private readonly pagesService: PagesService,
    private readonly pageKeywordService: PageKeywordService,
    private readonly prisma: PrismaService,
    private readonly contentTasks: ContentTasksService,
    private readonly pipelineCheckpoint: PipelineCheckpointService,
    private readonly publishService: PublishService,
  ) {}

  @Post()
  create(@Body() dto: CreatePageDto) {
    return this.pagesService.create(dto);
  }

  /**
   * Queue Traffic Engine v3 pipeline for this page (creates a ContentTask and enqueues the worker).
   * Use resetCheckpoint=true to clear resume state so generation runs from the start again.
   */
  @Post(':id/generate-content')
  async queueGenerateContent(
    @ParseIntParam('id') pageId: number,
    @Query('resetCheckpoint') resetCheckpoint?: string,
  ) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { keyword: true },
    });
    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }
    if (!page.keyword) {
      throw new UnprocessableEntityException('Page must have a keyword to generate content');
    }
    if (resetCheckpoint === 'true' || resetCheckpoint === '1') {
      await this.pipelineCheckpoint.clear(pageId);
    }
    return this.contentTasks.create({
      siteId: page.siteId,
      keywordId: page.keywordId,
      pageId: page.id,
    });
  }

  /**
   * Manually publish a page (or retry a failed webhook).
   * Works for both autoPublish=true sites (retry) and autoPublish=false sites (manual review flow).
   */
  @Post(':id/publish')
  async publishPage(@ParseIntParam('id') pageId: number) {
    const result = await this.publishService.publishPage(pageId);
    return result;
  }

  @Get()
  findBySite(
    @Query('siteId', ParseIntPipe) siteId: number,
    @Query('status') status?: PageStatus,
    @Query('language') language?: ContentLanguage,
  ) {
    return this.pagesService.findBySite(siteId, status, language);
  }

  @Get(':id')
  findOne(@ParseIntParam('id') id: number) {
    return this.pagesService.findOne(id);
  }

  @Patch(':id')
  update(@ParseIntParam('id') id: number, @Body() dto: UpdatePageDto) {
    return this.pagesService.update(id, dto);
  }

  // ─── PageKeyword (cluster management) ───────────────────────────────────────

  @Post(':id/keywords')
  assignKeyword(@ParseIntParam('id') id: number, @Body() dto: AssignPageKeywordDto) {
    return this.pageKeywordService.assign(id, dto);
  }

  @Get(':id/keywords')
  listKeywords(@ParseIntParam('id') id: number) {
    return this.pageKeywordService.listForPage(id);
  }

  @Delete(':id/keywords/:keywordId')
  removeKeyword(
    @ParseIntParam('id') id: number,
    @ParseIntParam('keywordId') keywordId: number,
  ) {
    return this.pageKeywordService.remove(id, keywordId);
  }
}
