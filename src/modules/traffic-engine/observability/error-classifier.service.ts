import { Injectable } from '@nestjs/common';

export type ErrorClass =
  | 'TRANSIENT'
  | 'PERMANENT'
  | 'BUDGET_EXCEEDED'
  | 'POLICY_VIOLATION'
  | 'UNKNOWN';

@Injectable()
export class ErrorClassifierService {
  classify(error: unknown): ErrorClass {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('POLICY_VIOLATION')) return 'POLICY_VIOLATION';
    if (message.includes('BUDGET_EXCEEDED')) return 'BUDGET_EXCEEDED';
    if (
      message.includes('HTTP 429') ||
      message.includes('HTTP 5') ||
      message.includes('timeout') ||
      message.includes('ECONNRESET')
    ) {
      return 'TRANSIENT';
    }
    if (message.includes('HTTP 401') || message.includes('HTTP 403') || message.includes('not configured')) {
      return 'PERMANENT';
    }
    return 'UNKNOWN';
  }
}
