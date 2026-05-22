import { Injectable, Logger } from '@nestjs/common';
import { ErrorClassifierService } from './error-classifier.service';
import { TelegramAlertService } from './telegram-alert.service';

export interface ErrorTrackContext {
  siteId?: number;
  siteDomain?: string;
  pageId?: number;
  subjectId?: number;
  step: string;
  source: 'pipeline' | 'idea_generation';
}

@Injectable()
export class ErrorTrackerService {
  private readonly logger = new Logger(ErrorTrackerService.name);

  constructor(
    private readonly classifier: ErrorClassifierService,
    private readonly telegramAlert: TelegramAlertService,
  ) {}

  track(error: unknown, context: ErrorTrackContext): void {
    const errorClass = this.classifier.classify(error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    this.logger.error({
      msg: 'traffic_engine_pipeline_error',
      ...context,
      errorClass,
      error: errorMessage,
    });

    if (errorClass !== 'PROVIDER_BILLING') return;

    this.telegramAlert.sendBillingAlert({
      provider: this.classifier.inferProvider(error),
      source: context.source,
      step: context.step,
      siteId: context.siteId,
      siteDomain: context.siteDomain,
      pageId: context.pageId,
      subjectId: context.subjectId,
      errorMessage,
    });
  }
}
