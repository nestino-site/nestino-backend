import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import {
  escapeTelegramHtml,
  telegramAlertsConfigured,
  telegramSendMessage,
} from './telegram-api.client';

export interface BillingAlertContext {
  provider: string;
  source: 'pipeline' | 'idea_generation';
  step: string;
  siteId?: number;
  siteDomain?: string;
  pageId?: number;
  subjectId?: number;
  errorMessage: string;
}

const DEFAULT_COOLDOWN_SEC = 3600;

@Injectable()
export class TelegramAlertService {
  private readonly logger = new Logger(TelegramAlertService.name);

  constructor(private readonly redis: RedisService) {}

  sendBillingAlert(context: BillingAlertContext): void {
    void this.sendBillingAlertAsync(context).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn({ msg: 'telegram_billing_alert_failed', error: message });
    });
  }

  async sendTestMessage(): Promise<{ messageId: number; botUsername?: string }> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
    if (!token || !chatId) {
      throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set');
    }

    const text = [
      '<b>Nestino — Telegram connection test</b>',
      'This is a manual test from scripts/test-telegram-alert.ts',
      'If you see this, billing alerts will work.',
      `Time: ${escapeTelegramHtml(new Date().toISOString())}`,
    ].join('\n');

    const result = await telegramSendMessage(token, chatId, text);
    return { messageId: result.message_id };
  }

  private async sendBillingAlertAsync(context: BillingAlertContext): Promise<void> {
    if (!telegramAlertsConfigured()) {
      this.logger.debug({ msg: 'telegram_alerts_disabled' });
      return;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN!.trim();
    const chatId = process.env.TELEGRAM_CHAT_ID!.trim();
    const cooldownSec = this.cooldownSec();
    const cooldownKey = `telegram:billing:${context.provider}`;

    const acquired = await this.redis.client.set(cooldownKey, '1', 'EX', cooldownSec, 'NX');
    if (acquired === null) {
      this.logger.log({
        msg: 'telegram_billing_alert_skipped_cooldown',
        provider: context.provider,
        cooldownSec,
      });
      return;
    }

    const siteLine =
      context.siteId !== undefined
        ? context.siteDomain
          ? `Site: ${escapeTelegramHtml(context.siteDomain)} (id=${context.siteId})`
          : `Site id: ${context.siteId}`
        : undefined;
    const pageLine = context.pageId !== undefined ? `Page: ${context.pageId}` : undefined;
    const subjectLine =
      context.subjectId !== undefined ? `Subject: ${context.subjectId}` : undefined;

    const lines = [
      '<b>Nestino — AI provider billing alert</b>',
      `Provider: ${escapeTelegramHtml(context.provider)}`,
      `Context: ${escapeTelegramHtml(context.source)} / ${escapeTelegramHtml(context.step)}`,
      siteLine,
      pageLine,
      subjectLine,
      `Error: ${escapeTelegramHtml(context.errorMessage.slice(0, 400))}`,
      `Time: ${escapeTelegramHtml(new Date().toISOString())}`,
      'Action: Check provider billing / upgrade plan',
    ].filter(Boolean);

    const result = await telegramSendMessage(token, chatId, lines.join('\n'));
    this.logger.log({
      msg: 'telegram_billing_alert_sent',
      provider: context.provider,
      messageId: result.message_id,
    });
  }

  private cooldownSec(): number {
    const raw = process.env.TELEGRAM_BILLING_ALERT_COOLDOWN_SEC;
    if (!raw) return DEFAULT_COOLDOWN_SEC;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_COOLDOWN_SEC;
  }
}
