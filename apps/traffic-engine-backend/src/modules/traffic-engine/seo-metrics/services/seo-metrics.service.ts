import { Injectable } from '@nestjs/common';
import { SeoMetric } from '@prisma/client';
import { PrismaErrorMapper } from '../../../../common/errors/prisma-error.mapper';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { UpsertSeoMetricDto } from '../dto/upsert-seo-metric.dto';

@Injectable()
export class SeoMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(dto: UpsertSeoMetricDto): Promise<SeoMetric> {
    const date = new Date(dto.date);
    const updateData = {
      query: dto.query ?? null,
      impressions: dto.impressions,
      clicks: dto.clicks,
      ctr: dto.ctr,
      avgPosition: dto.avgPosition,
      ctrExpected: dto.ctrExpected,
      ctrGap: dto.ctrGap,
      organicSessions: dto.organicSessions,
      bounceRate: dto.bounceRate,
    };

    try {
      const existing = await this.prisma.seoMetric.findFirst({
        where: {
          siteId: dto.siteId,
          pageId: dto.pageId ?? null,
          query: dto.query ?? null,
          date,
        },
      });

      if (existing) {
        return await this.prisma.seoMetric.update({
          where: { id: existing.id },
          data: updateData,
        });
      }

      return await this.prisma.seoMetric.create({
        data: {
          siteId: dto.siteId,
          pageId: dto.pageId ?? null,
          date,
          query: dto.query ?? null,
          impressions: dto.impressions ?? 0,
          clicks: dto.clicks ?? 0,
          ctr: dto.ctr ?? 0,
          avgPosition: dto.avgPosition,
          ctrExpected: dto.ctrExpected,
          ctrGap: dto.ctrGap,
          organicSessions: dto.organicSessions ?? 0,
          bounceRate: dto.bounceRate,
        },
      });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }

  async upsertMany(dtos: UpsertSeoMetricDto[]): Promise<SeoMetric[]> {
    return Promise.all(dtos.map((dto) => this.upsert(dto)));
  }

  async findBySite(siteId: number, days: number): Promise<SeoMetric[]> {
    const from = new Date();
    from.setDate(from.getDate() - days);
    return this.prisma.seoMetric.findMany({
      where: {
        siteId,
        date: { gte: from },
      },
      orderBy: { date: 'desc' },
    });
  }
}
