import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IdeaGenerationService } from '../content-ideas/idea-generation/idea-generation.service';
import { ErrorTrackerService } from '../observability/error-tracker.service';
import { IdeaGenerationJobPayload } from '../content-ideas/services/content-ideas.service';
import {
  TRAFFIC_ENGINE_IDEA_GENERATION_QUEUE,
  TRAFFIC_ENGINE_IDEA_JOB_PROCESS,
} from '../queue/queue.constants';

@Injectable()
@Processor(TRAFFIC_ENGINE_IDEA_GENERATION_QUEUE)
export class IdeaGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(IdeaGenerationProcessor.name);

  constructor(
    private readonly ideaGenerationService: IdeaGenerationService,
    private readonly errorTracker: ErrorTrackerService,
  ) {
    super();
  }

  async process(job: Job<IdeaGenerationJobPayload>): Promise<void> {
    if (job.name !== TRAFFIC_ENGINE_IDEA_JOB_PROCESS) {
      return;
    }

    const { subjectId, count, provider } = job.data;
    this.logger.log({ msg: 'idea_generation_job_started', subjectId, count, jobId: job.id });

    try {
      const result = await this.ideaGenerationService.generateForSubject(
        subjectId,
        count,
        provider,
      );
      this.logger.log({
        msg: 'idea_generation_job_completed',
        subjectId,
        created: result.created,
        jobId: job.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({
        msg: 'idea_generation_job_failed',
        subjectId,
        jobId: job.id,
        error: message,
      });
      this.errorTracker.track(error, {
        subjectId,
        step: 'idea_generation',
        source: 'idea_generation',
      });
      throw error;
    }
  }
}
