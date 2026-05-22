import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ContentTask, Prisma, TaskStatus, TaskType } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaErrorMapper } from '../../../../common/errors/prisma-error.mapper';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import {
  TRAFFIC_ENGINE_AI_JOB_PROCESS,
  TRAFFIC_ENGINE_AI_QUEUE,
} from '../../queue/queue.constants';
import { CreateContentTaskDto } from '../dto/create-content-task.dto';

export interface AiGenerationJobPayload {
  pageId: number;
  contentTaskId?: number;
}

@Injectable()
export class ContentTasksService {
  private readonly logger = new Logger(ContentTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(TRAFFIC_ENGINE_AI_QUEUE) private readonly aiQueue: Queue<AiGenerationJobPayload>,
  ) {}

  async create(dto: CreateContentTaskDto): Promise<ContentTask> {
    let task: ContentTask;
    try {
      task = await this.prisma.contentTask.create({
        data: {
          siteId: dto.siteId,
          keywordId: dto.keywordId,
          pageId: dto.pageId,
          type: dto.type ?? TaskType.GENERATE_CONTENT,
          status: TaskStatus.QUEUED,
          payload: dto.payload as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }

    if (dto.pageId) {
      await this.enqueueAiJobBestEffort(dto.pageId, task.id);
    }
    return task;
  }

  /**
   * Keep content-task creation responsive even when Redis/queue is degraded.
   * The task row is still created and can be retried later by explicit requeue calls.
   */
  async enqueueAiJobBestEffort(pageId: number, contentTaskId: number): Promise<void> {
    const enqueueTimeoutMs = Number(process.env.TASK_ENQUEUE_TIMEOUT_MS ?? 1200);
    try {
      await Promise.race([
        this.enqueueAiJob(pageId, contentTaskId),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error(`enqueue_timeout_${enqueueTimeoutMs}ms`)), enqueueTimeoutMs),
        ),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({
        msg: 'content_task_enqueue_failed',
        pageId,
        contentTaskId,
        error: message,
      });
    }
  }

  async enqueueAiJob(pageId: number, contentTaskId: number): Promise<void> {
    // BullMQ rejects ':' in custom jobId; use a stable delimiter between two cuids.
    const jobId = `${pageId}-${contentTaskId}`;
    await this.aiQueue.add(TRAFFIC_ENGINE_AI_JOB_PROCESS, { pageId, contentTaskId }, { jobId });
  }

  async findAll(siteId?: number): Promise<ContentTask[]> {
    return this.prisma.contentTask.findMany({
      where: siteId ? { siteId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number): Promise<ContentTask> {
    const task = await this.prisma.contentTask.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException(`ContentTask ${id} not found`);
    }
    return task;
  }

  async retryFailedTask(taskId: number): Promise<ContentTask> {
    const task = await this.findOne(taskId);
    if (task.status !== TaskStatus.FAILED) {
      throw new UnprocessableEntityException(
        `ContentTask ${taskId} is not failed (status=${task.status})`,
      );
    }
    if (!task.pageId) {
      throw new UnprocessableEntityException(`ContentTask ${taskId} has no pageId`);
    }

    const updated = await this.prisma.contentTask.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.QUEUED,
        errorLog: null,
        failedAt: null,
        lockedAt: null,
        lockedBy: null,
        currentStep: null,
      },
    });

    await this.enqueueAiJobBestEffort(task.pageId, taskId);
    return updated;
  }
}
