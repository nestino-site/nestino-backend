import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AiProvider, ContentIdea, IdeaStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaErrorMapper } from '../../../../common/errors/prisma-error.mapper';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import {
  TRAFFIC_ENGINE_IDEA_GENERATION_QUEUE,
  TRAFFIC_ENGINE_IDEA_JOB_PROCESS,
} from '../../queue/queue.constants';
import { SubjectsService } from '../../subjects/services/subjects.service';
import { IdeaValidationService } from '../idea-validation.service';

export interface IdeaGenerationJobPayload {
  subjectId: number;
  count: number;
  provider?: AiProvider;
}

@Injectable()
export class ContentIdeasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subjectsService: SubjectsService,
    private readonly validation: IdeaValidationService,
    @InjectQueue(TRAFFIC_ENGINE_IDEA_GENERATION_QUEUE)
    private readonly ideaQueue: Queue<IdeaGenerationJobPayload>,
  ) {}

  async enqueueGeneration(
    subjectId: number,
    count: number,
    provider?: AiProvider,
  ): Promise<{ jobQueued: true; subjectId: number; count: number }> {
    await this.subjectsService.findOne(subjectId);

    const jobId = `subject-${subjectId}-${Date.now()}`;
    await this.ideaQueue.add(
      TRAFFIC_ENGINE_IDEA_JOB_PROCESS,
      { subjectId, count, provider },
      { jobId },
    );

    return { jobQueued: true, subjectId, count };
  }

  async findBySubject(subjectId: number, status?: IdeaStatus): Promise<ContentIdea[]> {
    await this.subjectsService.findOne(subjectId);
    return this.prisma.contentIdea.findMany({
      where: {
        subjectId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const idea = await this.prisma.contentIdea.findUnique({
      where: { id },
      include: { subject: true },
    });
    if (!idea) {
      throw new NotFoundException(`ContentIdea ${id} not found`);
    }
    return idea;
  }

  async approve(id: number, reviewNotes?: string): Promise<ContentIdea> {
    const idea = await this.findOne(id);
    const subject = idea.subject;

    if (this.validation.isBulkApproveBlocked(idea.hallucinationRiskScore, subject.riskCategory)) {
      throw new ForbiddenException(
        'High hallucination risk on sensitive subject — manual single review required',
      );
    }

    return this.updateStatus(id, IdeaStatus.APPROVED, reviewNotes);
  }

  async reject(id: number, reviewNotes?: string): Promise<ContentIdea> {
    return this.updateStatus(id, IdeaStatus.REJECTED, reviewNotes);
  }

  async requestRevision(id: number, reviewNotes?: string): Promise<ContentIdea> {
    return this.updateStatus(id, IdeaStatus.NEEDS_REVISION, reviewNotes);
  }

  async bulkApprove(ideaIds: number[], reviewNotes?: string): Promise<{ updated: number }> {
    const ideas = await this.prisma.contentIdea.findMany({
      where: { id: { in: ideaIds } },
      include: { subject: true },
    });

    if (ideas.length !== ideaIds.length) {
      throw new BadRequestException('One or more content idea IDs were not found');
    }

    for (const idea of ideas) {
      if (this.validation.isBulkApproveBlocked(idea.hallucinationRiskScore, idea.subject.riskCategory)) {
        throw new ForbiddenException(
          `Idea ${idea.id} exceeds risk threshold for bulk approve on sensitive subject`,
        );
      }
    }

    const result = await this.prisma.contentIdea.updateMany({
      where: { id: { in: ideaIds } },
      data: {
        status: IdeaStatus.APPROVED,
        reviewNotes: reviewNotes ?? null,
      },
    });

    return { updated: result.count };
  }

  async bulkReject(ideaIds: number[], reviewNotes?: string): Promise<{ updated: number }> {
    const result = await this.prisma.contentIdea.updateMany({
      where: { id: { in: ideaIds } },
      data: {
        status: IdeaStatus.REJECTED,
        reviewNotes: reviewNotes ?? null,
      },
    });
    return { updated: result.count };
  }

  private async updateStatus(
    id: number,
    status: IdeaStatus,
    reviewNotes?: string,
  ): Promise<ContentIdea> {
    await this.findOne(id);
    try {
      return await this.prisma.contentIdea.update({
        where: { id },
        data: {
          status,
          reviewNotes: reviewNotes ?? null,
        },
      });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }
}
