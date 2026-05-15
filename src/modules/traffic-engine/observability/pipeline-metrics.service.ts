import { Injectable } from '@nestjs/common';
import { AiGenerationStatus, AiProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

interface RecordStepMetricInput {
  pageId: number;
  siteId: number;
  step: string;
  model: string;
  provider: AiProvider;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latencyMs: number;
  success: boolean;
}

@Injectable()
export class PipelineMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordStepMetricInput): Promise<void> {
    await this.prisma.aiGenerationLog.create({
      data: {
        pageId: input.pageId,
        pipelineVersion: 3,
        stepKey: input.step,
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        cost: new Prisma.Decimal(input.cost),
        durationMs: input.latencyMs,
        promptHash: `${input.step}:${Date.now()}`,
        status: input.success ? AiGenerationStatus.SUCCESS : AiGenerationStatus.FAILED,
      },
    });
  }

  async getStepBreakdown(pageId: number) {
    return this.prisma.aiGenerationLog.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSiteSuccessRatio(siteId: number, since: Date): Promise<{ success: number; failed: number }> {
    const rows = await this.prisma.aiGenerationLog.findMany({
      where: {
        createdAt: { gte: since },
        page: { siteId },
      },
      select: { status: true },
    });
    return rows.reduce(
      (acc: { success: number; failed: number }, row: { status: AiGenerationStatus }) => {
        if (row.status === AiGenerationStatus.SUCCESS) {
          acc.success += 1;
        } else {
          acc.failed += 1;
        }
        return acc;
      },
      { success: 0, failed: 0 },
    );
  }
}
