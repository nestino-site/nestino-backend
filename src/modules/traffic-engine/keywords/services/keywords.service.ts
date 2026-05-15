import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentLanguage, Keyword } from '@prisma/client';
import { PrismaErrorMapper } from '../../../../common/errors/prisma-error.mapper';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { KeywordDataProviderService } from '../../keyword-research/keyword-data-provider.service';
import { CreateKeywordDto } from '../dto/create-keyword.dto';
import { UpdateKeywordDto } from '../dto/update-keyword.dto';

@Injectable()
export class KeywordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keywordData: KeywordDataProviderService,
  ) {}

  async create(dto: CreateKeywordDto): Promise<Keyword> {
    const lang = dto.language ?? ContentLanguage.EN;
    const enriched = await this.keywordData.enrichSeedKeyword(dto.keyword, lang);
    const relatedNote =
      enriched.relatedKeywords.length > 0
        ? `Related (${enriched.source}): ${enriched.relatedKeywords.slice(0, 8).join('; ')}`
        : undefined;

    try {
      return await this.prisma.keyword.create({
        data: {
          siteId: dto.siteId,
          keyword: dto.keyword,
          language: lang,
          baseKeywordId: dto.baseKeywordId,
          intent: dto.intent,
          status: dto.status,
          searchVolume: dto.searchVolume ?? enriched.searchVolume,
          difficulty: dto.difficulty ?? enriched.difficulty,
          cpc: dto.cpc,
          priority: dto.priority,
          targetUrl: dto.targetUrl,
          notes: dto.notes ?? relatedNote,
        },
      });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }

  async findBySite(siteId: number): Promise<Keyword[]> {
    return this.prisma.keyword.findMany({
      where: { siteId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findCluster(rootId: number): Promise<Keyword[]> {
    return this.prisma.keyword.findMany({
      where: {
        OR: [{ id: rootId }, { baseKeywordId: rootId }],
      },
      orderBy: [{ language: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: number): Promise<Keyword> {
    const keyword = await this.prisma.keyword.findUnique({ where: { id } });
    if (!keyword) {
      throw new NotFoundException(`Keyword ${id} not found`);
    }
    return keyword;
  }

  async update(id: number, dto: UpdateKeywordDto): Promise<Keyword> {
    await this.findOne(id);
    try {
      return await this.prisma.keyword.update({ where: { id }, data: dto });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }
}
