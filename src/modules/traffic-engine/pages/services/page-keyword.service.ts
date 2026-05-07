import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PageKeyword, PageKeywordRole } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { ClusterBuilderService } from '../../intelligence/keyword-intelligence/cluster-builder.service';
import { AssignPageKeywordDto } from '../dto/assign-page-keyword.dto';

@Injectable()
export class PageKeywordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clusterBuilder: ClusterBuilderService,
  ) {}

  async assign(pageId: string, dto: AssignPageKeywordDto): Promise<PageKeyword> {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException(`Page ${pageId} not found`);

    // Enforce: only one PRIMARY per page
    if (dto.role === PageKeywordRole.PRIMARY) {
      const existing = await this.prisma.pageKeyword.findFirst({
        where: { pageId, role: PageKeywordRole.PRIMARY },
      });
      if (existing && existing.keywordId !== dto.keywordId) {
        throw new ConflictException(
          'Page already has a PRIMARY keyword. Remove it first or assign as SECONDARY.',
        );
      }
    }

    // Keyword must belong to the same site
    const keyword = await this.prisma.keyword.findFirst({
      where: { id: dto.keywordId, siteId: page.siteId },
    });
    if (!keyword) {
      throw new BadRequestException(`Keyword ${dto.keywordId} does not belong to this site`);
    }

    try {
      const assigned = await this.prisma.pageKeyword.upsert({
        where: { pageId_keywordId: { pageId, keywordId: dto.keywordId } },
        create: { pageId, keywordId: dto.keywordId, role: dto.role, weight: dto.weight },
        update: { role: dto.role, weight: dto.weight },
      });

      // Invalidate cluster cache if primary keyword changed
      if (dto.role === PageKeywordRole.PRIMARY) {
        await this.clusterBuilder.invalidateCache(dto.keywordId);
      }

      return assigned;
    } catch {
      throw new ConflictException('Failed to assign keyword to page');
    }
  }

  async listForPage(pageId: string): Promise<(PageKeyword & { keyword: { keyword: string; intent: string; language: string } })[]> {
    return this.prisma.pageKeyword.findMany({
      where: { pageId },
      include: { keyword: { select: { keyword: true, intent: true, language: true } } },
      orderBy: [{ role: 'asc' }, { weight: 'desc' }],
    }) as Promise<(PageKeyword & { keyword: { keyword: string; intent: string; language: string } })[]>;
  }

  async remove(pageId: string, keywordId: string): Promise<void> {
    const existing = await this.prisma.pageKeyword.findUnique({
      where: { pageId_keywordId: { pageId, keywordId } },
    });
    if (!existing) throw new NotFoundException('PageKeyword assignment not found');
    await this.prisma.pageKeyword.delete({ where: { pageId_keywordId: { pageId, keywordId } } });
  }
}
