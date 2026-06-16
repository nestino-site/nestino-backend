import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentLanguage, Page, PageStatus, PipelineStatus, Prisma } from '@prisma/client';
import { PrismaErrorMapper } from '../../../../common/errors/prisma-error.mapper';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { normalizePageSlug } from '../../content-api/catalog/slug.util';
import { ContentCacheService } from '../../content-api/content-cache.service';
import { ContentRenderService } from '../../content-api/content-render.service';
import { PublishService } from '../../publishing/publish.service';
import { cleanMarkdownOutput } from '../../utils/markdown-cleaner';
import { CreatePageDto } from '../dto/create-page.dto';
import { UpdatePageContentDto } from '../dto/update-page-content.dto';
import { UpdatePageDto } from '../dto/update-page.dto';
import { UpdatePageSlugDto } from '../dto/update-page-slug.dto';
import { PageListItem, pageListSelect } from '../page-list.select';

export interface UpdatePageContentResult {
  id: number;
  slug: string;
  status: PageStatus;
  pipelineStatus: PipelineStatus;
  wordCount: number;
  republished: boolean;
  webhookFired: boolean;
  humanEditedAt: string;
  updatedAt: Date;
}

export interface UpdatePageSlugResult {
  id: number;
  slug: string;
  previousSlug: string;
  status: PageStatus;
  changed: boolean;
  republished: boolean;
  webhookFired: boolean;
  updatedAt: Date;
}

@Injectable()
export class PagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentRender: ContentRenderService,
    private readonly contentCache: ContentCacheService,
    private readonly publishService: PublishService,
  ) {}

  async create(dto: CreatePageDto): Promise<Page> {
    try {
      return await this.prisma.page.create({
        data: {
          siteId: dto.siteId,
          keywordId: dto.keywordId,
          slug: dto.slug,
          language: dto.language ?? ContentLanguage.EN,
          title: dto.title,
          metaTitle: dto.metaTitle,
          metaDescription: dto.metaDescription,
          finalContent: dto.finalContent,
          status: dto.status ?? PageStatus.DRAFT,
        },
      });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }

  async findBySite(
    siteId: number,
    status?: PageStatus,
    language?: ContentLanguage,
    page = 1,
    limit = 50,
  ): Promise<PageListItem[]> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 200);

    return this.prisma.page.findMany({
      where: {
        siteId,
        ...(status ? { status } : {}),
        ...(language ? { language } : {}),
      },
      select: pageListSelect,
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
  }

  async findOne(id: number): Promise<Page> {
    const page = await this.prisma.page.findUnique({ where: { id } });
    if (!page) {
      throw new NotFoundException(`Page ${id} not found`);
    }
    return page;
  }

  async update(id: number, dto: UpdatePageDto): Promise<Page> {
    await this.findOne(id);
    try {
      return await this.prisma.page.update({ where: { id }, data: dto });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }

  async updateContent(
    id: number,
    dto: UpdatePageContentDto,
  ): Promise<UpdatePageContentResult> {
    const page = await this.findOne(id);
    const cleaned = cleanMarkdownOutput(dto.finalContent);
    const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
    const rendered = this.contentRender.renderFromMarkdown(cleaned);
    const renderedFields = this.contentRender.toJsonFields(rendered);
    const humanEditedAt = new Date().toISOString();

    const existingAudit =
      page.contentAuditResult && typeof page.contentAuditResult === 'object'
        ? (page.contentAuditResult as Record<string, unknown>)
        : {};

    const updated = await this.prisma.page.update({
      where: { id },
      data: {
        finalContent: cleaned,
        rawDraft: cleaned,
        wordCount,
        optimizationCount: { increment: 1 },
        ...renderedFields,
        contentAuditResult: {
          ...existingAudit,
          humanEdited: true,
          humanEditedAt,
        } as Prisma.InputJsonValue,
      },
    });

    await this.contentCache.invalidatePage(updated.siteId, updated.slug, updated.id);

    let republished = false;
    let webhookFired = false;

    if (dto.republish && updated.status === PageStatus.PUBLISHED) {
      const publishResult = await this.publishService.publishPage(id);
      republished = publishResult.published;
      webhookFired = publishResult.webhookFired;
    }

    return {
      id: updated.id,
      slug: updated.slug,
      status: updated.status,
      pipelineStatus: updated.pipelineStatus,
      wordCount: updated.wordCount ?? wordCount,
      republished,
      webhookFired,
      humanEditedAt,
      updatedAt: updated.updatedAt,
    };
  }

  async updateSlug(id: number, dto: UpdatePageSlugDto): Promise<UpdatePageSlugResult> {
    const page = await this.findOne(id);

    let normalized: string;
    try {
      normalized = normalizePageSlug(dto.slug);
    } catch {
      throw new BadRequestException('Slug cannot be empty');
    }

    if (normalized === page.slug) {
      return {
        id: page.id,
        slug: page.slug,
        previousSlug: page.slug,
        status: page.status,
        changed: false,
        republished: false,
        webhookFired: false,
        updatedAt: page.updatedAt,
      };
    }

    const previousSlug = page.slug;

    let updated: Page;
    try {
      updated = await this.prisma.page.update({
        where: { id },
        data: { slug: normalized },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `A page with slug '${normalized}' already exists for this site and language`,
        );
      }
      throw PrismaErrorMapper.toHttpException(error);
    }

    await this.contentCache.invalidatePage(page.siteId, previousSlug, id);
    await this.contentCache.invalidatePage(updated.siteId, normalized, id);

    let republished = false;
    let webhookFired = false;

    const shouldRepublish =
      updated.status === PageStatus.PUBLISHED && dto.republish !== false;

    if (shouldRepublish) {
      const webhookResult = await this.publishService.triggerUpdateWebhook(id, {
        previousSlug,
      });
      republished = webhookResult.webhookFired;
      webhookFired = webhookResult.webhookFired;
    }

    return {
      id: updated.id,
      slug: updated.slug,
      previousSlug,
      status: updated.status,
      changed: true,
      republished,
      webhookFired,
      updatedAt: updated.updatedAt,
    };
  }
}
