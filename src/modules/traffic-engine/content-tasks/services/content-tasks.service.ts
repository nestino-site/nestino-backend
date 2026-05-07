import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
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
  pageId: string;
  contentTaskId?: string;
}

@Injectable()
export class ContentTasksService {
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
      await this.enqueueAiJob(dto.pageId, task.id);
    }
    return task;
  }

  async enqueueAiJob(pageId: string, contentTaskId: string): Promise<void> {
    // BullMQ rejects ':' in custom jobId; use a stable delimiter between two cuids.
    const jobId = `${pageId}-${contentTaskId}`;
    await this.aiQueue.add(TRAFFIC_ENGINE_AI_JOB_PROCESS, { pageId, contentTaskId }, { jobId });
  }

  async findAll(siteId?: string): Promise<ContentTask[]> {
    return this.prisma.contentTask.findMany({
      where: siteId ? { siteId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<ContentTask> {
    const task = await this.prisma.contentTask.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException(`ContentTask ${id} not found`);
    }
    return task;
  }
}
