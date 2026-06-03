import { Injectable, Logger } from '@nestjs/common';
import { IdeaStatus, KeywordIntent, PageStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { KeywordDataProviderService } from '../keyword-research/keyword-data-provider.service';

@Injectable()
export class TopicalClusterService {
  private readonly logger = new Logger(TopicalClusterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly serpData: KeywordDataProviderService,
  ) {}

  /**
   * Build or refresh a topical cluster for a site, using Subject data + SERP entity signals.
   * Auto-surfaces missing topic pages as ContentIdea rows.
   */
  async buildForSite(siteId: number): Promise<void> {
    const subjects = await this.prisma.subject.findMany({
      where: { siteId },
      include: { template: true },
    });

    for (const subject of subjects) {
      await this.syncTopicalCluster(siteId, subject);
    }
  }

  /**
   * Sync entities from a fresh SERP snapshot into a page's topical cluster,
   * then surface gaps as ContentIdea rows.
   */
  async enrichFromSerp(
    siteId: number,
    keyword: string,
    language: string,
    country = 'us',
  ): Promise<void> {
    const snap = await this.serpData.getSnapshot(keyword, language as never, country);
    if (!snap || snap.entities.length === 0) return;

    // Find or create the topical cluster keyed by site + keyword topic
    const cluster = await this.prisma.topicalCluster.upsert({
      where: {
        id: (await this.findClusterForKeyword(siteId, keyword))?.id ?? 0,
      },
      create: {
        siteId,
        name: keyword,
        entities: snap.entities,
        topics: [...snap.organicTitles.slice(0, 6), ...snap.paaQuestions.slice(0, 4)],
      },
      update: {
        entities: snap.entities,
      },
    });

    // Surface gaps: entities not mentioned in any published page title
    await this.surfaceMissingEntityPages(siteId, cluster.id, snap.entities, keyword);
  }

  private async findClusterForKeyword(siteId: number, keyword: string) {
    return this.prisma.topicalCluster.findFirst({
      where: { siteId, name: { contains: keyword, mode: 'insensitive' } },
      select: { id: true },
    });
  }

  private async syncTopicalCluster(
    siteId: number,
    subject: { id: number; title: string; primaryKeywords: string[]; pillarPageId: number | null },
  ): Promise<void> {
    // Gather topics from published pages for this subject
    const pages = await this.prisma.page.findMany({
      where: { siteId, status: PageStatus.PUBLISHED },
      include: { keyword: true },
    });

    const coveredTopics = pages.map((p) => p.keyword.keyword.toLowerCase());
    const allTopics = subject.primaryKeywords;
    const coveredSet = new Set(coveredTopics);
    const coverageGap = allTopics.filter((t) => !coveredSet.has(t.toLowerCase()));

    await this.prisma.topicalCluster.upsert({
      where: {
        id: (await this.findClusterForKeyword(siteId, subject.title))?.id ?? 0,
      },
      create: {
        siteId,
        name: subject.title,
        pillarPageId: subject.pillarPageId,
        topics: allTopics,
        coverageGap,
        entities: [],
      },
      update: {
        topics: allTopics,
        coverageGap,
        pillarPageId: subject.pillarPageId,
      },
    });
  }

  private async surfaceMissingEntityPages(
    siteId: number,
    topicalClusterId: number,
    entities: string[],
    primaryKeyword: string,
  ): Promise<void> {
    for (const entity of entities.slice(0, 5)) {
      const existingPage = await this.prisma.page.findFirst({
        where: {
          siteId,
          OR: [
            { title: { contains: entity, mode: 'insensitive' } },
            { keyword: { keyword: { contains: entity, mode: 'insensitive' } } },
          ],
        },
        select: { id: true },
      });
      if (existingPage) continue;

      const subject = await this.prisma.subject.findFirst({
        where: { siteId },
        select: { id: true },
      });
      if (!subject) continue;

      const existingIdea = await this.prisma.contentIdea.findFirst({
        where: {
          subjectId: subject.id,
          title: { contains: entity, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (existingIdea) continue;

      const slug = entity
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 80);

      await this.prisma.contentIdea.create({
        data: {
          subjectId: subject.id,
          title: `${entity} — Complete Guide`,
          slug: `${slug}-guide`,
          targetKeyword: entity,
          searchIntent: KeywordIntent.INFORMATIONAL,
          headings: [entity, `What is ${entity}?`, `${entity} and ${primaryKeyword}`],
          status: IdeaStatus.PENDING_REVIEW,
          confidenceScore: 0.6,
        },
      }).catch(() => null); // silently skip if unique constraint fails
    }

    this.logger.debug({ msg: 'topical_entity_gaps_surfaced', entities: entities.length, topicalClusterId });
  }
}
