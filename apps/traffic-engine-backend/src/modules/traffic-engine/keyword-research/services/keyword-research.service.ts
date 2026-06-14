import { BadRequestException, Injectable } from '@nestjs/common';
import { KeywordResearch, KeywordResearchSource } from '@prisma/client';
import { PrismaErrorMapper } from '../../../../common/errors/prisma-error.mapper';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { ContentLanguage } from '@prisma/client';
import { KeywordDataProviderService } from '../keyword-data-provider.service';
import { CreateKeywordResearchDto } from '../dto/create-keyword-research.dto';

@Injectable()
export class KeywordResearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keywordData: KeywordDataProviderService,
  ) {}

  async create(dto: CreateKeywordResearchDto): Promise<KeywordResearch> {
    const allowedSources: KeywordResearchSource[] = [
      KeywordResearchSource.MANUAL,
      KeywordResearchSource.GSC,
    ];
    if (!allowedSources.includes(dto.source)) {
      throw new BadRequestException(`Source ${dto.source} is not supported`);
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

  async enrichFromProvider(seedKeyword: string, language: ContentLanguage) {
    return this.keywordData.enrichSeedKeyword(seedKeyword, language);
  }

  async createFromGscSeed(
    seedKeyword: string,
    language: ContentLanguage,
    suggestions: string[],
  ): Promise<KeywordResearch> {
    const existing = await this.prisma.keywordResearch.findFirst({
      where: { seedKeyword, language, source: KeywordResearchSource.GSC },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.keywordResearch.create({
      data: {
        seedKeyword,
        language,
        suggestions,
        source: KeywordResearchSource.GSC,
      },
    });
  }
}
