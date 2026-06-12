import { Injectable, NotFoundException } from '@nestjs/common';
import { PageStatus, Prisma } from '@prisma/client';
import { PipelineStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { contentPageSelect } from './content-page.select';

export interface ListPublishedPagesFilter {
  pageType?: string;
  country?: string;
  city?: string;
  treatment?: string;
}

const publishedPageListSelect = {
  id: true,
  slug: true,
  language: true,
  updatedAt: true,
  title: true,
  pageType: true,
  entities: true,
} satisfies Prisma.PageSelect;

@Injectable()
export class ContentStateManagerService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(pageId: number) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: contentPageSelect,
    });
    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }
    return page;
  }

  async updateStatus(pageId: number, status: PipelineStatus): Promise<void> {
    await this.prisma.page.update({
      where: { id: pageId },
      data: { pipelineStatus: status },
    });
  }

  async getStateBySlug(siteId: number, slug: string) {
    const normalized = slug.startsWith('/') ? slug : `/${slug}`;
    const page = await this.prisma.page.findFirst({
      where: { siteId, slug: normalized },
      select: contentPageSelect,
    });
    if (!page) {
      throw new NotFoundException(`Page with slug ${normalized} not found`);
    }
    return page;
  }

  async listPublishedForSite(siteId: number, filter?: ListPublishedPagesFilter) {
    const where: Prisma.PageWhereInput = {
      siteId,
      status: PageStatus.PUBLISHED,
      ...(filter?.pageType ? { pageType: filter.pageType } : {}),
    };

    const pages = await this.prisma.page.findMany({
      where,
      select: publishedPageListSelect,
      orderBy: { publishedAt: 'desc' },
    });

    if (!filter?.country && !filter?.city && !filter?.treatment) {
      return pages;
    }

    return pages.filter((page) => this.matchesEntityFilter(page.entities, filter));
  }

  private matchesEntityFilter(
    entities: unknown,
    filter: ListPublishedPagesFilter,
  ): boolean {
    if (!entities || typeof entities !== 'object' || Array.isArray(entities)) {
      return false;
    }
    const e = entities as Record<string, { slug?: string } | undefined>;

    if (filter.country && e.country?.slug !== filter.country) return false;
    if (filter.city && e.city?.slug !== filter.city) return false;
    if (filter.treatment && e.treatment?.slug !== filter.treatment) return false;

    return true;
  }
}
