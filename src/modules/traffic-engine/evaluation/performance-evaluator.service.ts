import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { TaskStatus, TaskType } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  TRAFFIC_ENGINE_AI_JOB_PROCESS,
  TRAFFIC_ENGINE_AI_QUEUE,
} from '../queue/queue.constants';

@Injectable()
export class PerformanceEvaluatorService {
  private readonly logger = new Logger(PerformanceEvaluatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(TRAFFIC_ENGINE_AI_QUEUE) private readonly aiQueue: Queue<{ pageId: number; contentTaskId?: number }>,
  ) {}

  async evaluateSite(siteId: number): Promise<void> {
    const ctrThreshold = Number(process.env.UNDERPERFORM_CTR_THRESHOLD ?? 0.02);
    const daysOld = Number(process.env.UNDERPERFORM_DAYS_OLD ?? 30);
    const minImpressions = Number(process.env.UNDERPERFORM_MIN_IMPRESSIONS ?? 100);
    const rewriteCooldownDays = Number(process.env.REWRITE_COOLDOWN_DAYS ?? 14);
    const since = new Date();
    since.setDate(since.getDate() - daysOld);
    const cooldownSince = new Date();
    cooldownSince.setDate(cooldownSince.getDate() - rewriteCooldownDays);

    const pages = await this.prisma.page.findMany({
      where: {
        siteId,
        AND: [{ publishedAt: { not: null } }, { publishedAt: { lte: since } }],
      },
      include: {
        seoMetrics: { orderBy: { date: 'desc' }, take: 7 },
      },
    });

    for (const page of pages) {
      const metrics = page.seoMetrics;
      if (metrics.length === 0) {
        continue;
      }

      const totalImpressions = metrics.reduce((s, m) => s + m.impressions, 0);
      if (totalImpressions < minImpressions) {
        continue;
      }

      const latest = metrics[0];
      if (latest.ctr >= ctrThreshold || !page.finalContent) {
        continue;
      }

      const recentRewrite = await this.prisma.contentTask.findFirst({
        where: {
          pageId: page.id,
          type: TaskType.REWRITE_CONTENT,
          createdAt: { gte: cooldownSince },
        },
      });
      if (recentRewrite) {
        continue;
      }

      const task = await this.prisma.contentTask.create({
        data: {
          siteId,
          pageId: page.id,
          keywordId: page.keywordId,
          type: TaskType.REWRITE_CONTENT,
          status: TaskStatus.QUEUED,
        },
      });
      await this.aiQueue.add(
        TRAFFIC_ENGINE_AI_JOB_PROCESS,
        { pageId: page.id, contentTaskId: task.id },
        { jobId: `${page.id}-${task.id}` },
      );
      this.logger.log({
        msg: 'refresh_enqueued',
        pageId: page.id,
        siteId,
        ctr: latest.ctr,
        impressions: totalImpressions,
      });
    }
  }
}
