export interface TelegramSendMessageResult {
  message_id: number;
}

export interface TelegramGetMeResult {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  description?: string;
  result?: T;
}

export function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function telegramAlertsConfigured(): boolean {
  if (process.env.TELEGRAM_ALERTS_ENABLED === 'false') return false;
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());
}

export async function telegramGetMe(token: string): Promise<TelegramGetMeResult> {
  return telegramApiCall<TelegramGetMeResult>(token, 'getMe');
}

export async function telegramSendMessage(
  token: string,
  chatId: string,
  text: string,
): Promise<TelegramSendMessageResult> {
  return telegramApiCall<TelegramSendMessageResult>(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

async function telegramApiCall<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

  const data = (await res.json()) as TelegramApiResponse<T>;
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description ?? res.statusText}`);
  }
  if (data.result === undefined) {
    throw new Error(`Telegram ${method} failed: empty result`);
  }
  return data.result;
}
