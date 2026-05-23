import { Injectable, NotFoundException } from '@nestjs/common';
import { PageStatus } from '@prisma/client';
import { PipelineStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { contentPageSelect } from './content-page.select';

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

  async listPublishedForSite(siteId: number) {
    return this.prisma.page.findMany({
      where: { siteId, status: PageStatus.PUBLISHED },
      select: { id: true, slug: true, language: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
    });
  }
}
