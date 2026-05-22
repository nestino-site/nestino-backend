import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

export type PipelineStep =
  | 'generate'
  | 'validate'
  | 'analyze'
  | 'geo_score'
  | 'adversarial_stress_test'
  | 'rewrite'
  | 'image_generation'
  | 'seo_check'
  | 'internal_linking'
  | 'final_geo_schema';

export interface PipelineCheckpoint {
  completedSteps: PipelineStep[];
  lastStep: PipelineStep;
  lastModel?: string;
  abVariant?: 'A' | 'B';
  draftSaved: boolean;
}

const PIPELINE_STEP_ORDER: PipelineStep[] = [
  'generate',
  'validate',
  'analyze',
  'geo_score',
  'adversarial_stress_test',
  'rewrite',
  'image_generation',
  'seo_check',
  'internal_linking',
  'final_geo_schema',
];

@Injectable()
export class PipelineCheckpointService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async save(pageId: number, checkpoint: PipelineCheckpoint): Promise<void> {
    await this.redis.client.setex(
      this.key(pageId),
      24 * 60 * 60,
      JSON.stringify(checkpoint),
    );
  }

  async load(pageId: number): Promise<PipelineCheckpoint | null> {
    const raw = await this.redis.client.get(this.key(pageId));
    if (raw) {
      return JSON.parse(raw) as PipelineCheckpoint;
    }
    return this.loadFromPage(pageId);
  }

  async clear(pageId: number): Promise<void> {
    await this.redis.client.del(this.key(pageId));
  }

  /**
   * Remove `fromStep` and all later steps so the pipeline can resume from that step.
   */
  async rewindToStep(pageId: number, fromStep: PipelineStep): Promise<PipelineCheckpoint> {
    const existing = (await this.load(pageId)) ?? this.defaultCheckpointBefore(fromStep);
    const stepsToRemove = new Set(this.stepsFrom(fromStep));
    const completedSteps = existing.completedSteps.filter((step) => !stepsToRemove.has(step));
    const lastStep =
      completedSteps.length > 0
        ? completedSteps[completedSteps.length - 1]
        : this.stepBefore(fromStep);

    const checkpoint: PipelineCheckpoint = {
      ...existing,
      completedSteps,
      lastStep,
      draftSaved: existing.draftSaved || completedSteps.includes('generate'),
    };

    await this.save(pageId, checkpoint);
    await this.prisma.page.update({
      where: { id: pageId },
      data: { pipelineCheckpoint: checkpoint as unknown as Prisma.InputJsonValue },
    });

    return checkpoint;
  }

  private async loadFromPage(pageId: number): Promise<PipelineCheckpoint | null> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: { pipelineCheckpoint: true },
    });
    if (!page?.pipelineCheckpoint || typeof page.pipelineCheckpoint !== 'object') {
      return null;
    }
    return page.pipelineCheckpoint as unknown as PipelineCheckpoint;
  }

  private stepsFrom(fromStep: PipelineStep): PipelineStep[] {
    const idx = PIPELINE_STEP_ORDER.indexOf(fromStep);
    if (idx < 0) {
      return [fromStep];
    }
    return PIPELINE_STEP_ORDER.slice(idx);
  }

  private stepBefore(step: PipelineStep): PipelineStep {
    const idx = PIPELINE_STEP_ORDER.indexOf(step);
    if (idx <= 0) {
      return 'generate';
    }
    return PIPELINE_STEP_ORDER[idx - 1];
  }

  private defaultCheckpointBefore(fromStep: PipelineStep): PipelineCheckpoint {
    const priorSteps = PIPELINE_STEP_ORDER.slice(0, PIPELINE_STEP_ORDER.indexOf(fromStep));
    const lastStep = priorSteps.length > 0 ? priorSteps[priorSteps.length - 1] : 'generate';
    return {
      completedSteps: priorSteps,
      lastStep,
      draftSaved: priorSteps.includes('generate'),
    };
  }

  private key(pageId: number): string {
    return `pipeline:checkpoint:${pageId}`;
  }
}
