/**
 * Verify Telegram bot token + chat id wiring (same API client as production alerts).
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=-5255113334 npm run telegram:test
 * Or add vars to .env (gitignored) and run npm run telegram:test
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  escapeTelegramHtml,
  telegramGetMe,
  telegramSendMessage,
} from '../src/modules/traffic-engine/observability/telegram-api.client';

function loadDotEnv(): void {
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function main(): Promise<void> {
  loadDotEnv();

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token) {
    console.error('Missing TELEGRAM_BOT_TOKEN (set in .env or shell)');
    process.exit(1);
  }
  if (!chatId) {
    console.error('Missing TELEGRAM_CHAT_ID (set in .env or shell)');
    process.exit(1);
  }

  console.log('Step 1/2: validating bot token (getMe)...');
  const me = await telegramGetMe(token);
  console.log(
    `OK: bot @${me.username ?? me.first_name} (id=${me.id}, is_bot=${me.is_bot})`,
  );

  const text = [
    '<b>Nestino — Telegram connection test</b>',
    'This is a manual test from scripts/test-telegram-alert.ts',
    'If you see this, billing alerts will work.',
    `Time: ${escapeTelegramHtml(new Date().toISOString())}`,
  ].join('\n');

  console.log(`Step 2/2: sending test message to chat ${chatId}...`);
  const sent = await telegramSendMessage(token, chatId, text);
  console.log(`OK: message sent (message_id=${sent.message_id})`);
  console.log('Check your Telegram group for the test message.');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`FAILED: ${message}`);
  if (message.includes('403') || message.toLowerCase().includes('forbidden')) {
    console.error('Hint: add the bot to the Telegram group and try again.');
  }
  if (message.includes('401') || message.toLowerCase().includes('unauthorized')) {
    console.error('Hint: check TELEGRAM_BOT_TOKEN (revoke/regenerate in @BotFather if needed).');
  }
  process.exit(1);
});
