import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentLanguage, Page, PageStatus } from '@prisma/client';
import { PrismaErrorMapper } from '../../../../common/errors/prisma-error.mapper';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { CreatePageDto } from '../dto/create-page.dto';
import { UpdatePageDto } from '../dto/update-page.dto';
import { PageListItem, pageListSelect } from '../page-list.select';

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
}
