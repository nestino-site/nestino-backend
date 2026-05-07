import { BadRequestException, Injectable } from '@nestjs/common';
import { KeywordResearch, KeywordResearchSource } from '@prisma/client';
import { PrismaErrorMapper } from '../../../../common/errors/prisma-error.mapper';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { CreateKeywordResearchDto } from '../dto/create-keyword-research.dto';

@Injectable()
export class KeywordResearchService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateKeywordResearchDto): Promise<KeywordResearch> {
    if (dto.source !== KeywordResearchSource.MANUAL) {
      throw new BadRequestException('Only MANUAL source is supported in Phase 2');
    }
    try {
      return await this.prisma.keywordResearch.create({
        data: {
          seedKeyword: dto.seedKeyword,
          language: dto.language,
          suggestions: dto.suggestions,
          source: dto.source,
        },
      });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }

  async findAll(): Promise<KeywordResearch[]> {
    return this.prisma.keywordResearch.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
