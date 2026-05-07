import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentLanguage, Keyword } from '@prisma/client';
import { PrismaErrorMapper } from '../../../../common/errors/prisma-error.mapper';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { CreateKeywordDto } from '../dto/create-keyword.dto';
import { UpdateKeywordDto } from '../dto/update-keyword.dto';

@Injectable()
export class KeywordsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateKeywordDto): Promise<Keyword> {
    try {
      return await this.prisma.keyword.create({
        data: {
          siteId: dto.siteId,
          keyword: dto.keyword,
          language: dto.language ?? ContentLanguage.EN,
          baseKeywordId: dto.baseKeywordId,
          intent: dto.intent,
          status: dto.status,
          searchVolume: dto.searchVolume,
          difficulty: dto.difficulty,
          cpc: dto.cpc,
          priority: dto.priority,
          targetUrl: dto.targetUrl,
          notes: dto.notes,
        },
      });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }

  async findBySite(siteId: string): Promise<Keyword[]> {
    return this.prisma.keyword.findMany({
      where: { siteId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findCluster(rootId: string): Promise<Keyword[]> {
    return this.prisma.keyword.findMany({
      where: {
        OR: [{ id: rootId }, { baseKeywordId: rootId }],
      },
      orderBy: [{ language: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string): Promise<Keyword> {
    const keyword = await this.prisma.keyword.findUnique({ where: { id } });
    if (!keyword) {
      throw new NotFoundException(`Keyword ${id} not found`);
    }
    return keyword;
  }

  async update(id: string, dto: UpdateKeywordDto): Promise<Keyword> {
    await this.findOne(id);
    try {
      return await this.prisma.keyword.update({ where: { id }, data: dto });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }
}
