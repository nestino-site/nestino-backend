import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentLanguage, Page, PageStatus } from '@prisma/client';
import { PrismaErrorMapper } from '../../../../common/errors/prisma-error.mapper';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { CreatePageDto } from '../dto/create-page.dto';
import { UpdatePageDto } from '../dto/update-page.dto';

@Injectable()
export class PagesService {
  constructor(private readonly prisma: PrismaService) {}

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

  async findBySite(siteId: string, status?: PageStatus, language?: ContentLanguage): Promise<Page[]> {
    return this.prisma.page.findMany({
      where: {
        siteId,
        ...(status ? { status } : {}),
        ...(language ? { language } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<Page> {
    const page = await this.prisma.page.findUnique({ where: { id } });
    if (!page) {
      throw new NotFoundException(`Page ${id} not found`);
    }
    return page;
  }

  async update(id: string, dto: UpdatePageDto): Promise<Page> {
    await this.findOne(id);
    try {
      return await this.prisma.page.update({ where: { id }, data: dto });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }
}
