import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { TaskStatus, TaskType } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PipelineCheckpointService } from '../pipeline-v3/pipeline-checkpoint.service';
import { TrafficEnginePipelineService } from '../pipeline-v3/traffic-engine-pipeline.service';
import { TRAFFIC_ENGINE_AI_JOB_PROCESS, TRAFFIC_ENGINE_AI_QUEUE } from '../queue/queue.constants';

export interface AiGenerationJobPayload {
  pageId: number;
  contentTaskId?: number;
}

@Injectable()
@Processor(TRAFFIC_ENGINE_AI_QUEUE)
export class AiGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(AiGenerationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly checkpointService: PipelineCheckpointService,
    private readonly pipeline: TrafficEnginePipelineService,
  ) {
    super();
  }

  async process(job: Job<AiGenerationJobPayload>): Promise<void> {
    if (job.name !== TRAFFIC_ENGINE_AI_JOB_PROCESS) {
      return;
    }
    const { pageId, contentTaskId } = job.data;
    const checkpoint = await this.checkpointService.load(pageId);
    if (checkpoint) {
      this.logger.log({
        msg: 'pipeline_resume_detected',
        pageId,
        lastStep: checkpoint.lastStep,
      });
    }

    if (contentTaskId) {
      const task = await this.prisma.contentTask.findUnique({ where: { id: contentTaskId } });
      if (!task) {
        return;
      }
      if (task.status === TaskStatus.COMPLETED) {
        return;
      }
      if (task.status !== TaskStatus.QUEUED) {
        return;
      }
      const claim = await this.prisma.contentTask.updateMany({
        where: { id: contentTaskId, status: TaskStatus.QUEUED },
        data: {
          status: TaskStatus.PROCESSING,
          startedAt: new Date(),
          attempts: { increment: 1 },
          currentStep: 'ai_pipeline',
          lockedAt: new Date(),
          lockedBy: `worker:${job.id}`,
        },
      });
      if (claim.count === 0) {
        return;
      }
    }

    try {
      // Route to the lightweight refresh path for REFRESH_TITLE_META tasks
      if (contentTaskId) {
        const task = await this.prisma.contentTask.findUnique({ where: { id: contentTaskId }, select: { type: true } });
        if (task?.type === TaskType.REFRESH_TITLE_META) {
          await this.pipeline.runRefreshTitleMeta(pageId, contentTaskId);
          return;
        }
      }
      await this.pipeline.run(pageId, contentTaskId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ msg: 'ai_pipeline_failed', pageId, contentTaskId, message });
      if (contentTaskId) {
        await this.prisma.contentTask.update({
          where: { id: contentTaskId },
          data: {
            status: TaskStatus.FAILED,
            errorLog: message,
            failedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
          },
        });
      }
      throw error;
    }
  }
}
