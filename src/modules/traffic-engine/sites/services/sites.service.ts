import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentLanguage, PageStatus, Prisma, Site, TaskStatus, TaskType } from '@prisma/client';
import { PrismaErrorMapper } from '../../../../common/errors/prisma-error.mapper';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { SiteApiKeyService } from '../../../identity/services/site-api-key.service';
import { ContentTasksService } from '../../content-tasks/services/content-tasks.service';
import { BulkGenerateDto } from '../dto/bulk-generate.dto';
import { CreateSiteDto } from '../dto/create-site.dto';
import { PatchAiPipelineDto } from '../dto/patch-ai-pipeline.dto';
import { UpdateSiteDto } from '../dto/update-site.dto';

export interface BulkGenerateResult {
  queued: number;
  skipped: number;
  taskIds: string[];
}

export interface CreateSiteResult {
  site: Site;
  contentApiKey: string;
}

export interface RotateContentApiKeyResult {
  siteId: string;
  contentApiKey: string;
  contentApiKeyCreatedAt: Date;
}

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentTasks: ContentTasksService,
    private readonly siteApiKeyService: SiteApiKeyService,
  ) {}

  async create(dto: CreateSiteDto): Promise<CreateSiteResult> {
    const defaultLanguage = dto.defaultLanguage ?? ContentLanguage.EN;
    const languages =
      dto.languages && dto.languages.length > 0 ? dto.languages : [defaultLanguage];
    const { plaintext, hash } = await this.siteApiKeyService.generateWithHash();
    const now = new Date();
    try {
      const site = await this.prisma.site.create({
        data: {
          name: dto.name,
          domain: dto.domain,
          defaultLanguage,
          languages,
          timezone: dto.timezone ?? 'UTC',
          status: dto.status,
          gscProperty: dto.gscProperty,
          ga4PropertyId: dto.ga4PropertyId,
          publishWebhookUrl: dto.publishWebhookUrl,
          publishWebhookSecret: dto.publishWebhookSecret,
          autoPublish: dto.autoPublish,
          contentApiKeyHash: hash,
          contentApiKeyCreatedAt: now,
        },
      });
      return { site, contentApiKey: plaintext };
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }

  async rotateContentApiKey(siteId: string): Promise<RotateContentApiKeyResult> {
    await this.findOne(siteId);
    const { plaintext, hash } = await this.siteApiKeyService.generateWithHash();
    const now = new Date();
    try {
      await this.prisma.site.update({
        where: { id: siteId },
        data: {
          contentApiKeyHash: hash,
          contentApiKeyCreatedAt: now,
        },
      });
      return {
        siteId,
        contentApiKey: plaintext,
        contentApiKeyCreatedAt: now,
      };
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }

  async findAll(): Promise<Site[]> {
    return this.prisma.site.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string): Promise<Site> {
    const site = await this.prisma.site.findUnique({ where: { id } });
    if (!site) {
      throw new NotFoundException(`Site ${id} not found`);
    }
    return site;
  }

  async update(id: string, dto: UpdateSiteDto): Promise<Site> {
    await this.findOne(id);
    try {
      return await this.prisma.site.update({ where: { id }, data: dto });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }

  /**
   * Batch-create pages for each keyword and enqueue the AI pipeline.
   * Skips keywords that already have a page for this site.
   * Respects aiBudgetLimit from site config (no-op if budget would be exceeded).
   */
  async bulkGenerate(siteId: string, dto: BulkGenerateDto): Promise<BulkGenerateResult> {
    await this.findOne(siteId);

    const keywords = await this.prisma.keyword.findMany({
      where: { id: { in: dto.keywordIds }, siteId },
    });

    const existingPages = await this.prisma.page.findMany({
      where: { siteId, keywordId: { in: dto.keywordIds } },
      select: { keywordId: true },
    });
    const alreadyQueued = new Set(existingPages.map((p) => p.keywordId));

    const taskIds: string[] = [];
    let skipped = 0;

    for (const kw of keywords) {
      if (alreadyQueued.has(kw.id)) {
        skipped++;
        continue;
      }

      // Create page + task in one transaction
      const { page, task } = await this.prisma.$transaction(async (tx) => {
        const page = await tx.page.create({
          data: {
            siteId,
            keywordId: kw.id,
            slug: `/${kw.keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
            status: PageStatus.DRAFT,
          },
        });
        const task = await tx.contentTask.create({
          data: {
            siteId,
            keywordId: kw.id,
            pageId: page.id,
            type: TaskType.GENERATE_CONTENT,
            status: TaskStatus.QUEUED,
          },
        });
        return { page, task };
      });

      await this.contentTasks.enqueueAiJob(page.id, task.id);
      taskIds.push(task.id);
    }

    return { queued: taskIds.length, skipped, taskIds };
  }

  async patchAiPipeline(id: string, dto: PatchAiPipelineDto): Promise<Site> {
    await this.findOne(id);
    const stepKeys = new Set(dto.steps.map((s) => s.stepKey));
    if (stepKeys.size !== dto.steps.length) {
      throw new BadRequestException('Each stepKey must be unique');
    }
    const payload = JSON.parse(
      JSON.stringify({ version: dto.version, steps: dto.steps }),
    ) as Prisma.InputJsonValue;
    try {
      return await this.prisma.site.update({
        where: { id },
        data: { aiPipeline: payload },
      });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }
}
