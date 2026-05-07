import { Injectable, Logger } from '@nestjs/common';
import { ErrorClass } from './error-classifier.service';

interface ErrorContext {
  pageId: string;
  siteId: string;
  step: string;
  errorClass: ErrorClass;
}

@Injectable()
export class ErrorTrackerService {
  private readonly logger = new Logger(ErrorTrackerService.name);

  track(error: unknown, context: ErrorContext): void {
    this.logger.error({
      msg: 'traffic_engine_pipeline_error',
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
