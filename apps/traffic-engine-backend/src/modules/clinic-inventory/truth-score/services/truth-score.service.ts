import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { Prisma, TruthScoreGrade } from '@prisma/client';

interface DimensionScore {
  [dimensionCode: string]: number;
}

function computeGrade(composite: number): TruthScoreGrade {
  if (composite >= 85) return 'A';
  if (composite >= 70) return 'B';
  if (composite >= 55) return 'C';
  if (composite >= 40) return 'D';
  return 'F';
}

@Injectable()
export class TruthScoreService {
  private readonly logger = new Logger(TruthScoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private get minInterviewsForLive(): number {
    return Number(this.configService.get<string>('MIN_INTERVIEWS_FOR_LIVE') ?? '5');
  }

  // ── Compute Truth Score for a single clinic ───────────────────────────────

  async computeForClinic(clinicId: number): Promise<void> {
    const [dimensions, publishedInterviews] = await Promise.all([
      this.prisma.truthScoreDimension.findMany({ where: { isActive: true } }),
      this.prisma.patientInterview.findMany({
        where: { clinicId, status: 'PUBLISHED' },
        include: { answers: true },
      }),
    ]);

    const interviewCount = publishedInterviews.length;
    const isLive = interviewCount >= this.minInterviewsForLive;

    // Collect scored answers grouped by dimension
    const dimAnswers: Record<string, number[]> = {};
    for (const interview of publishedInterviews) {
      for (const answer of interview.answers) {
        if (answer.scoredValue == null) continue;
        if (!dimAnswers[answer.dimensionCode]) dimAnswers[answer.dimensionCode] = [];
        dimAnswers[answer.dimensionCode].push(answer.scoredValue);
      }
    }

    const dimensionScores: DimensionScore = {};
    let weightedSum = 0;
    let totalWeight = 0;

    for (const dim of dimensions) {
      const scores = dimAnswers[dim.code];
      if (!scores || scores.length === 0) continue;
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      dimensionScores[dim.code] = Math.round(avg);
      const w = Number(dim.weight);
      weightedSum += avg * w;
      totalWeight += w;
    }

    const composite = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
    const grade = composite != null ? computeGrade(composite) : null;

    const payload = {
      composite: composite ?? undefined,
      grade: grade ?? undefined,
      dimensionScores: dimensionScores as Prisma.InputJsonValue,
      interviewCount,
      status: isLive ? ('LIVE' as const) : ('PENDING' as const),
      lastComputedAt: new Date(),
    };

    await this.prisma.clinicTruthScore.upsert({
      where: { clinicId },
      create: { clinicId, ...payload },
      update: payload,
    });

    // Snapshot for audit history
    await this.prisma.clinicTruthScoreSnapshot.create({
      data: {
        clinicId,
        composite: composite ?? undefined,
        grade: grade ?? undefined,
        dimensionScores: dimensionScores as Prisma.InputJsonValue,
        interviewCount,
      },
    });

    this.logger.debug(`Truth Score for clinic ${clinicId}: composite=${composite}, grade=${grade}, interviews=${interviewCount}`);
  }

  // ── Compute for all clinics with new interviews since last compute ─────────

  async recomputeStale(): Promise<void> {
    const staleScoreDays = 30;
    const cutoff = new Date(Date.now() - staleScoreDays * 24 * 60 * 60 * 1000);

    // Clinics with recently published interviews
    const clinicsWithNewInterviews = await this.prisma.patientInterview.groupBy({
      by: ['clinicId'],
      where: { status: 'PUBLISHED', publishedAt: { gte: cutoff } },
    });

    // Also clinics with no score yet
    const clinicsWithNoScore = await this.prisma.clinic.findMany({
      where: {
        status: 'PUBLISHED',
        truthScore: null,
        interviews: { some: { status: 'PUBLISHED' } },
      },
      select: { id: true },
    });

    const allIds = new Set([
      ...clinicsWithNewInterviews.map((r) => r.clinicId),
      ...clinicsWithNoScore.map((c) => c.id),
    ]);

    this.logger.log(`Recomputing Truth Scores for ${allIds.size} clinics`);
    for (const clinicId of allIds) {
      try {
        await this.computeForClinic(clinicId);
      } catch (err) {
        this.logger.error(`Failed to compute score for clinic ${clinicId}: ${String(err)}`);
      }
    }
  }

  // ── Cron: daily recompute at 4 AM UTC ─────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async scheduledRecompute(): Promise<void> {
    this.logger.log('Scheduled Truth Score recompute started');
    await this.recomputeStale();
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getScore(clinicId: number) {
    return this.prisma.clinicTruthScore.findUnique({
      where: { clinicId },
    });
  }

  getScoreHistory(clinicId: number) {
    return this.prisma.clinicTruthScoreSnapshot.findMany({
      where: { clinicId },
      orderBy: { computedAt: 'desc' },
      take: 20,
    });
  }
}
