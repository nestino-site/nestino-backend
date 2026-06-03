import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'crypto';
import { ClinicWebhookPayloadDto } from './dto/clinic-webhook-payload.dto';
import { Public } from '../../identity/decorators/public.decorator';
import { ClinicWebhookHandlerService } from './clinic-webhook-handler.service';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function verifyHmacSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

@ApiTags('Clinic Inventory Webhook')
@Controller('clinic-inventory')
export class ClinicWebhookController {
  private readonly logger = new Logger(ClinicWebhookController.name);

  constructor(private readonly webhookHandler: ClinicWebhookHandlerService) {}

  @Post('webhook')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Inbound webhook from external clinic-inventory (legacy HTTP)' })
  @ApiHeader({ name: 'x-clinic-signature', required: true, description: 'HMAC SHA256 signature' })
  @ApiHeader({ name: 'x-event-type', required: true, description: 'Event type override' })
  @ApiResponse({ status: 200, description: 'Webhook accepted' })
  @ApiResponse({ status: 401, description: 'Invalid webhook signature' })
  async handleClinicWebhook(
    @Body() payload: ClinicWebhookPayloadDto,
    @Headers('x-clinic-signature') signature: string,
    @Headers('x-event-type') eventType: string,
  ): Promise<{ ok: boolean }> {
    const secret = process.env.TRAFFIC_ENGINE_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.warn('TRAFFIC_ENGINE_WEBHOOK_SECRET not configured — skipping signature check');
    } else {
      const rawBody = stableStringify(payload);
      if (!signature || !verifyHmacSignature(rawBody, signature, secret)) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    const event = eventType ?? payload.event;
    await this.webhookHandler.handleEvent(event, payload);

    return { ok: true };
  }
}
