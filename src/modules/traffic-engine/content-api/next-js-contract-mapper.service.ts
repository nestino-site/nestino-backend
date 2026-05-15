import { Injectable } from '@nestjs/common';
import { Page, PipelineStatus } from '@prisma/client';
import { HreflangService } from '../seo-strategy/hreflang.service';
import { cleanMarkdownOutput } from '../utils/markdown-cleaner';

type PageWithLogs = Page & {
  aiGenerationLogs: Array<{
    model: string;
    cost: unknown;
    stepKey: string;
    createdAt: Date;
  }>;
};

@Injectable()
export class NextJsContractMapperService {
  constructor(private readonly hreflang: HreflangService) {}

  async toContract(page: PageWithLogs) {
    const hreflangAlternates = await this.hreflang.getAlternatesForPage(page.id);
    const latestLog = page.aiGenerationLogs[0];
    const status = this.mapStatus(page.pipelineStatus);
    const totalCost = page.aiGenerationLogs.reduce((sum, log) => sum + Number(log.cost), 0);
    return {
      version: '2.0',
      status,
      draft: page.rawDraft != null ? cleanMarkdownOutput(page.rawDraft) : null,
      analysis: {
        seoScore: page.seoScore,
        readabilityScore: page.readabilityScore,
        intentMatch: page.intentMatch,
        contentDepth: page.contentDepth,
        redundancyScore: page.redundancyScore,
        gaps: page.contentGaps,
      },
      finalContent: page.finalContent != null ? cleanMarkdownOutput(page.finalContent) : null,
      meta: {
        pipelineStatus: page.pipelineStatus,
        pipelineVersion: page.pipelineVersion ?? 3,
        cost: Number(totalCost.toFixed(6)),
        modelUsed: latestLog?.model ?? null,
        completedSteps: this.deriveCompletedSteps(page.pipelineStatus),
        skippedSteps: page.pipelineStatus === PipelineStatus.SKIPPED_STEP ? ['rewrite'] : [],
        hreflangAlternates,
      },
      schemaMarkup: page.schemaMarkup ?? null,
      geoScore: page.geoScore,
    };
  }

  private mapStatus(status: PipelineStatus): string {
    if (status === PipelineStatus.READY) return 'ready';
    if (status === PipelineStatus.FAILED) return 'failed';
    if (status === PipelineStatus.PARTIALLY_COMPLETED) return 'partially_completed';
    return status.toLowerCase();
  }

  private deriveCompletedSteps(status: PipelineStatus): string[] {
    if (status === PipelineStatus.PENDING) return [];
    if (status === PipelineStatus.GENERATING) return ['generate'];
    if (status === PipelineStatus.VALIDATING) return ['generate', 'validate'];
    if (status === PipelineStatus.ANALYZING) return ['generate', 'validate', 'analyze'];
    return ['generate', 'validate', 'analyze', 'rewrite'];
  }
}
