import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';

export type PipelineStep =
  | 'generate'
  | 'validate'
  | 'analyze'
  | 'geo_score'
  | 'adversarial_stress_test'
  | 'rewrite'
  | 'image_generation'
  | 'seo_check';

export interface PipelineCheckpoint {
  completedSteps: PipelineStep[];
  lastStep: PipelineStep;
  lastModel?: string;
  abVariant?: 'A' | 'B';
  draftSaved: boolean;
}

@Injectable()
export class PipelineCheckpointService {
  constructor(private readonly redis: RedisService) {}

  async save(pageId: string, checkpoint: PipelineCheckpoint): Promise<void> {
    await this.redis.client.setex(
      this.key(pageId),
      24 * 60 * 60,
      JSON.stringify(checkpoint),
    );
  }

  async load(pageId: string): Promise<PipelineCheckpoint | null> {
    const raw = await this.redis.client.get(this.key(pageId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PipelineCheckpoint;
  }

  async clear(pageId: string): Promise<void> {
    await this.redis.client.del(this.key(pageId));
  }

  private key(pageId: string): string {
    return `pipeline:checkpoint:${pageId}`;
  }
}
