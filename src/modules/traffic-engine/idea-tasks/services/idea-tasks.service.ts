import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IdeaStatus,
  IdeaTask,
  IdeaTaskStatus,
  KeywordIntent,
  KeywordStatus,
  PageStatus,
  PipelineStatus,
  Prisma,
  TaskType,
} from '@prisma/client';
import { PrismaErrorMapper } from '../../../../common/errors/prisma-error.mapper';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { ContentTasksService } from '../../content-tasks/services/content-tasks.service';
import { CreateIdeaTaskDto } from '../dto/create-idea-task.dto';

@Injectable()
export class IdeaTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentTasksService: ContentTasksService,
  ) {}

  async createFromApprovedIdea(ideaId: string, dto: CreateIdeaTaskDto): Promise<IdeaTask> {
    const idea = await this.prisma.contentIdea.findUnique({
      where: { id: ideaId },
      include: { subject: true },
    });
    if (!idea) {
      throw new NotFoundException(`ContentIdea ${ideaId} not found`);
    }
    if (idea.status !== IdeaStatus.APPROVED) {
      throw new ForbiddenException('Only approved content ideas can create generation tasks');
    }

    const subject = idea.subject;
    const taskType = dto.type ?? TaskType.GENERATE_CONTENT;

    try {
      const { ideaTask, pageId, contentTaskId } = await this.prisma.$transaction(async (tx) => {
        const keyword = await tx.keyword.upsert({
          where: {
            siteId_keyword_language: {
              siteId: subject.siteId,
              keyword: idea.targetKeyword,
              language: subject.language,
            },
          },
          create: {
            siteId: subject.siteId,
            keyword: idea.targetKeyword,
            language: subject.language,
            intent: idea.searchIntent ?? KeywordIntent.INFORMATIONAL,
            status: KeywordStatus.PENDING,
            priority: 50,
            targetUrl: idea.slug,
          },
          update: {
            intent: idea.searchIntent ?? KeywordIntent.INFORMATIONAL,
            targetUrl: idea.slug,
          },
        });

        const page = await tx.page.create({
          data: {
            siteId: subject.siteId,
            keywordId: keyword.id,
            language: subject.language,
            slug: idea.slug,
            title: idea.title,
            metaTitle: idea.title,
            metaDescription: idea.metaDescription,
            outline: idea.outline as Prisma.InputJsonValue | undefined,
            status: PageStatus.DRAFT,
            pipelineStatus: PipelineStatus.PENDING,
          },
        });

        const ideaTask = await tx.ideaTask.create({
          data: {
            ideaId: idea.id,
            subjectId: subject.id,
            siteId: subject.siteId,
            type: taskType,
            status: IdeaTaskStatus.QUEUED,
            payload: {
              pageId: page.id,
              keywordId: keyword.id,
              contentIdeaId: idea.id,
            } as Prisma.InputJsonValue,
          },
        });

        const contentTask = await tx.contentTask.create({
          data: {
            siteId: subject.siteId,
            keywordId: keyword.id,
            pageId: page.id,
            type: taskType,
            payload: {
              siteName: subject.title,
              location: [subject.city, subject.country].filter(Boolean).join(', ') || undefined,
              seo_instructions: subject.seoGoal,
              contentIdeaId: idea.id,
              ideaTaskId: ideaTask.id,
            } as Prisma.InputJsonValue,
          },
        });

        const updatedIdeaTask = await tx.ideaTask.update({
          where: { id: ideaTask.id },
          data: {
            status: IdeaTaskStatus.PROCESSING,
            startedAt: new Date(),
            attempts: { increment: 1 },
            payload: {
              pageId: page.id,
              keywordId: keyword.id,
              contentIdeaId: idea.id,
              contentTaskId: contentTask.id,
            } as Prisma.InputJsonValue,
          },
        });

        return {
          ideaTask: updatedIdeaTask,
          pageId: page.id,
          contentTaskId: contentTask.id,
        };
      });

      await this.contentTasksService.enqueueAiJobBestEffort(pageId, contentTaskId);

      return ideaTask;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw PrismaErrorMapper.toHttpException(error);
    }
  }

  async findAll(subjectId?: string): Promise<IdeaTask[]> {
    return this.prisma.ideaTask.findMany({
      where: subjectId ? { subjectId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { idea: true },
    });
  }

  async findOne(id: string): Promise<IdeaTask> {
    const task = await this.prisma.ideaTask.findUnique({
      where: { id },
      include: { idea: true, subject: true },
    });
    if (!task) {
      throw new NotFoundException(`IdeaTask ${id} not found`);
    }
    return task;
  }
}
