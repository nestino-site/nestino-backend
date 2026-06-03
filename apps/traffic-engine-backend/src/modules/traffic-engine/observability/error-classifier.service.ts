import { Injectable } from '@nestjs/common';

export type ErrorClass =
  | 'TRANSIENT'
  | 'PERMANENT'
  | 'BUDGET_EXCEEDED'
  | 'POLICY_VIOLATION'
  | 'PROVIDER_BILLING'
  | 'UNKNOWN';

const PROVIDER_PREFIXES = [
  'OpenAI HTTP',
  'Anthropic HTTP',
  'Gemini HTTP',
  'Imagen HTTP',
] as const;

const BILLING_PHRASES = [
  'paid plans',
  'upgrade your account',
  'insufficient_quota',
  'billing_hard_limit',
  'exceeded your current quota',
  'credit balance',
  'purchase credits',
  'payment required',
  'insufficient funds',
  'quota exceeded',
  'http 402',
];

@Injectable()
export class ErrorClassifierService {
  classify(error: unknown): ErrorClass {
    const message = this.messageOf(error);
    if (message.includes('POLICY_VIOLATION')) return 'POLICY_VIOLATION';
    if (message.includes('BUDGET_EXCEEDED')) return 'BUDGET_EXCEEDED';
    if (this.isProviderBillingError(error)) return 'PROVIDER_BILLING';
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

  isProviderBillingError(error: unknown): boolean {
    const message = this.messageOf(error).toLowerCase();
    if (message.includes('http 402')) return true;

    for (const phrase of BILLING_PHRASES) {
      if (message.includes(phrase)) return true;
    }

    const hasProviderPrefix = PROVIDER_PREFIXES.some((prefix) =>
      this.messageOf(error).includes(prefix),
    );
    if (hasProviderPrefix && message.includes('billing')) return true;
    if (hasProviderPrefix && message.includes('account disabled')) return true;

    return false;
  }

  inferProvider(error: unknown): string {
    const message = this.messageOf(error);
    if (message.includes('OpenAI HTTP')) return 'openai';
    if (message.includes('Anthropic HTTP')) return 'anthropic';
    if (message.includes('Imagen HTTP')) return 'google-imagen';
    if (message.includes('Gemini HTTP')) return 'google-gemini';
    return 'unknown';
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
