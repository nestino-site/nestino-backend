import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SiteConfig } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import {
  HumanizationSettings,
  PromptConfig,
  RuntimeConfig,
  SiteConfigRecord,
} from './config.types';
import { UpdateSiteConfigDto, UpsertSiteConfigDto } from './dto/upsert-site-config.dto';

const SITE_CONFIG_CACHE_TTL_SECONDS = 300;
const CACHE_OP_TIMEOUT_MS = 800;

@Injectable()
export class SiteConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getForSite(siteId: number): Promise<SiteConfigRecord> {
    const cacheKey = this.getCacheKey(siteId);
    const cached = await this.safeCacheGet(cacheKey);
    if (cached) {
      return JSON.parse(cached) as SiteConfigRecord;
    }

    const config = await this.prisma.siteConfig.findUnique({ where: { siteId } });
    if (!config) {
      throw new NotFoundException(`SiteConfig for site ${siteId} not found`);
    }

    const normalized = this.normalize(config);
    await this.safeCacheSetex(
      cacheKey,
      SITE_CONFIG_CACHE_TTL_SECONDS,
      JSON.stringify(normalized),
    );
    return normalized;
  }

  async getForPage(pageId: number): Promise<SiteConfigRecord> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: { siteId: true },
    });
    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }
    return this.getForSite(page.siteId);
  }

  async upsert(dto: UpsertSiteConfigDto): Promise<SiteConfigRecord> {
    await this.prisma.site.findUniqueOrThrow({ where: { id: dto.siteId } });

    const data: Prisma.SiteConfigUncheckedCreateInput = {
      siteId: dto.siteId,
      aiBudgetLimit: dto.aiBudgetLimit,
      qualityThreshold: dto.qualityThreshold,
      pipelineConfig: dto.pipelineConfig as unknown as Prisma.InputJsonValue,
      modelConfig: dto.modelConfig as unknown as Prisma.InputJsonValue,
      promptConfig: dto.promptConfig as unknown as Prisma.InputJsonValue,
      runtimeConfig: dto.runtimeConfig as unknown as Prisma.InputJsonValue,
    };

    const config = await this.prisma.siteConfig.upsert({
      where: { siteId: dto.siteId },
      create: data,
      update: data,
    });
    await this.invalidate(dto.siteId);
    return this.normalize(config);
  }

  async update(siteId: number, dto: UpdateSiteConfigDto): Promise<SiteConfigRecord> {
    const existing = await this.prisma.siteConfig.findUnique({ where: { siteId } });
    if (!existing) {
      throw new NotFoundException(`SiteConfig for site ${siteId} not found`);
    }

    const config = await this.prisma.siteConfig.update({
      where: { siteId },
      data: {
        aiBudgetLimit: dto.aiBudgetLimit,
        qualityThreshold: dto.qualityThreshold,
        pipelineConfig: dto.pipelineConfig as Prisma.InputJsonValue | undefined,
        modelConfig: dto.modelConfig as Prisma.InputJsonValue | undefined,
        promptConfig: dto.promptConfig as Prisma.InputJsonValue | undefined,
        runtimeConfig: dto.runtimeConfig as Prisma.InputJsonValue | undefined,
      },
    });
    await this.invalidate(siteId);
    return this.normalize(config);
  }

  private async invalidate(siteId: number): Promise<void> {
    await this.safeCacheDel(this.getCacheKey(siteId));
  }

  private getCacheKey(siteId: number): string {
    return `site-cfg:${siteId}`;
  }

  private async safeCacheGet(key: string): Promise<string | null> {
    return this.withCacheTimeout(this.redis.client.get(key));
  }

  private async safeCacheSetex(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.withCacheTimeout(this.redis.client.setex(key, ttlSeconds, value));
  }

  private async safeCacheDel(key: string): Promise<void> {
    await this.withCacheTimeout(this.redis.client.del(key));
  }

  private async withCacheTimeout<T>(op: Promise<T>): Promise<T | null> {
    try {
      return await Promise.race([
        op,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), CACHE_OP_TIMEOUT_MS)),
      ]);
    } catch {
      return null;
    }
  }

  private normalize(config: SiteConfig): SiteConfigRecord {
    return {
      siteId: config.siteId,
      aiBudgetLimit: Number(config.aiBudgetLimit),
      qualityThreshold: config.qualityThreshold,
      pipelineConfig: config.pipelineConfig as unknown as SiteConfigRecord['pipelineConfig'],
      modelConfig: config.modelConfig as unknown as SiteConfigRecord['modelConfig'],
      promptConfig: this.coercePromptConfig(config.promptConfig),
      runtimeConfig: this.coerceRuntimeConfig(config.runtimeConfig),
    };
  }

  private coercePromptConfig(raw: unknown): PromptConfig {
    const p = raw as PromptConfig;
    const h: HumanizationSettings | undefined = p.humanization;
    const level: HumanizationSettings['level'] =
      h?.level === 'low' || h?.level === 'medium' || h?.level === 'high' ? h.level : 'medium';
    const enabled = typeof h?.enabled === 'boolean' ? h.enabled : true;
    return {
      ...p,
      imageGenerationVersion: p.imageGenerationVersion ?? 'v1',
      seoCheckVersion: p.seoCheckVersion ?? 'v1',
      humanization: { enabled, level },
    };
  }

  private coerceRuntimeConfig(raw: unknown): RuntimeConfig {
    const r = raw as RuntimeConfig;
    return {
      ...r,
      enableImageGeneration:
        typeof r.enableImageGeneration === 'boolean' ? r.enableImageGeneration : false,
      enableSeoCheck: typeof r.enableSeoCheck === 'boolean' ? r.enableSeoCheck : false,
    };
  }
}
