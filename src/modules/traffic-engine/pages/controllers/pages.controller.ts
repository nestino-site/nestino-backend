import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  NotFoundException,
  UnprocessableEntityException,
  ParseIntPipe,
} from '@nestjs/common';
import { ContentLanguage, PageStatus, PipelineStatus } from '@prisma/client';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { ContentTasksService } from '../../content-tasks/services/content-tasks.service';
import {
  PipelineCheckpointService,
  PipelineStep,
} from '../../pipeline-v3/pipeline-checkpoint.service';
import { PageHeroCdnService } from '../../publishing/page-hero-cdn.service';
import { ImageGenerationService } from '../../pipeline-v3/image-generation.service';
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
    private readonly pageHeroCdn: PageHeroCdnService,
    private readonly imageGeneration: ImageGenerationService,
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
   * Retry hero image generation and remaining pipeline steps without rerunning content generation.
   * Rewinds the checkpoint to just before image_generation and enqueues a new ContentTask.
   */
  @Post(':id/retry-image-generation')
  async retryImageGeneration(@ParseIntParam('id') pageId: number) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { keyword: true },
    });
    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }
    if (!page.keyword) {
      throw new UnprocessableEntityException('Page must have a keyword to retry image generation');
    }
    if (!page.rawDraft && !page.finalContent) {
      throw new UnprocessableEntityException(
        'Page has no generated content yet — use generate-content instead',
      );
    }

    const retryableStatuses: PipelineStatus[] = [
      PipelineStatus.PARTIALLY_COMPLETED,
      PipelineStatus.FAILED,
      PipelineStatus.READY,
    ];
    const imageMissing = !page.generatedImageBase64 && !page.generatedImageCdnUrl;
    if (!retryableStatuses.includes(page.pipelineStatus) && !imageMissing) {
      throw new UnprocessableEntityException(
        `Page pipeline status ${page.pipelineStatus} is not eligible for image retry`,
      );
    }

    const checkpoint = await this.pipelineCheckpoint.rewindToStep(pageId, 'image_generation');

    await this.prisma.page.update({
      where: { id: pageId },
      data: { pipelineStatus: PipelineStatus.PARTIALLY_COMPLETED },
    });

    const task = await this.contentTasks.create({
      siteId: page.siteId,
      keywordId: page.keywordId,
      pageId: page.id,
    });

    return {
      pageId,
      contentTaskId: task.id,
      resumedFrom: 'image_generation',
      checkpointLastStep: checkpoint.lastStep,
    };
  }

  /**
   * Finish remaining pipeline steps without re-running content or hero image generation.
   * Resumes from the first incomplete checkpoint step, or from an explicit `fromStep`.
   */
  @Post(':id/complete-pipeline')
  async completePipeline(
    @ParseIntParam('id') pageId: number,
    @Query('fromStep') fromStep?: string,
    @Query('skipYmylAudit') skipYmylAudit?: string,
  ) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { keyword: true },
    });
    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }
    if (!page.keyword) {
      throw new UnprocessableEntityException('Page must have a keyword to complete the pipeline');
    }
    if (!page.rawDraft && !page.finalContent) {
      throw new UnprocessableEntityException(
        'Page has no generated content yet — use generate-content instead',
      );
    }

    const eligibleStatuses: PipelineStatus[] = [
      PipelineStatus.PARTIALLY_COMPLETED,
      PipelineStatus.FAILED,
    ];
    if (!eligibleStatuses.includes(page.pipelineStatus)) {
      throw new UnprocessableEntityException(
        `Page pipeline status ${page.pipelineStatus} is not eligible for complete-pipeline`,
      );
    }

    let checkpoint = await this.pipelineCheckpoint.load(pageId);
    if (!checkpoint) {
      throw new UnprocessableEntityException(
        'No pipeline checkpoint found — use generate-content or retry-image-generation',
      );
    }

    if (fromStep !== undefined && fromStep !== '') {
      if (!this.pipelineCheckpoint.isValidCompletePipelineFromStep(fromStep)) {
        throw new UnprocessableEntityException(
          `Invalid fromStep "${fromStep}" — allowed: seo_check, internal_linking, final_geo_schema`,
        );
      }
      checkpoint = await this.pipelineCheckpoint.rewindToStep(
        pageId,
        fromStep as PipelineStep,
      );
    }

    const resumedFrom =
      this.pipelineCheckpoint.firstIncompleteStep(checkpoint.completedSteps) ?? 'finalize';
    const skippedSteps = [...checkpoint.completedSteps];

    await this.prisma.page.update({
      where: { id: pageId },
      data: { pipelineStatus: PipelineStatus.PARTIALLY_COMPLETED },
    });

    const useLightweightAudit = skipYmylAudit === 'true' || skipYmylAudit === '1';
    const task = await this.contentTasks.create({
      siteId: page.siteId,
      keywordId: page.keywordId,
      pageId: page.id,
      payload: useLightweightAudit ? { skipYmylAudit: true } : undefined,
    });

    return {
      pageId,
      contentTaskId: task.id,
      resumedFrom,
      checkpointLastStep: checkpoint.lastStep,
      skippedSteps,
      skipYmylAudit: useLightweightAudit,
    };
  }

  /**
   * Replace the hero image with a new Imagen generation (synchronous).
   * Use when the existing image quality is poor. Does not re-run content or pipeline steps.
   */
  @Post(':id/regenerate-hero-image')
  async regenerateHeroImage(
    @ParseIntParam('id') pageId: number,
    @Query('uploadCdn') uploadCdn?: string,
  ) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { keyword: true },
    });
    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }
    if (!page.keyword) {
      throw new UnprocessableEntityException('Page must have a keyword to regenerate hero image');
    }

    const content = page.finalContent ?? page.rawDraft;
    if (!content) {
      throw new UnprocessableEntityException(
        'Page has no generated content yet — use generate-content first',
      );
    }

    const { imagePrompt, generatedImageBase64 } = await this.imageGeneration.regenerateHeroImage(
      pageId,
      content,
      page.keyword.keyword,
    );

    if (!generatedImageBase64) {
      throw new UnprocessableEntityException('Hero image generation returned no image');
    }

    const shouldUploadCdn = uploadCdn !== 'false' && uploadCdn !== '0';
    let cdnResult: Awaited<ReturnType<PageHeroCdnService['retryHeroUpload']>> | null = null;
    if (shouldUploadCdn) {
      cdnResult = await this.pageHeroCdn.retryHeroUpload(pageId);
      if (page.status === PageStatus.PUBLISHED && cdnResult.uploaded) {
        await this.publishService.triggerUpdateWebhook(pageId);
      }
    }

    return {
      pageId,
      imagePrompt,
      generatedImageBase64: true,
      previousCdnUrlCleared: true,
      cdn: cdnResult,
    };
  }

  /**
   * Upload (or re-upload) the stored base64 hero image to Cloudinary without republishing.
   * Use when publish succeeded but CDN upload was skipped or failed.
   */
  @Post(':id/retry-hero-cdn')
  async retryHeroCdn(@ParseIntParam('id') pageId: number) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: { id: true, status: true },
    });
    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }

    const result = await this.pageHeroCdn.retryHeroUpload(pageId);

    if (result.skippedReason === 'no_base64_image') {
      throw new UnprocessableEntityException(
        'Page has no stored hero image — use retry-image-generation first',
      );
    }

    if (result.uploaded && page.status === PageStatus.PUBLISHED) {
      await this.publishService.triggerUpdateWebhook(pageId);
    }

    return result;
  }

  /**
   * Publish a page, re-publish after edits, or retry a failed webhook.
   * Already-published pages are re-rendered and the frontend receives a page.updated webhook.
   */
  @Post(':id/publish')
  async publishPage(@ParseIntParam('id') pageId: number) {
    const result = await this.publishService.publishPage(pageId);
    return result;
  }

  @Get()
  findBySite(
    @Query('siteId', ParseIntPipe) siteId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: PageStatus,
    @Query('language') language?: ContentLanguage,
  ) {
    return this.pagesService.findBySite(siteId, status, language, page, limit);
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
