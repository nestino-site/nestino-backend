import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { render } from '@react-email/render';
import { Resend } from 'resend';
import OtpEmail from '../templates/otp-email';

@Injectable()
export class EmailService {
  private readonly resend: Resend;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY');
    this.resend = new Resend(key ?? '');
  }

  async sendOtpEmail(to: string, otp: string, villaName?: string): Promise<void> {
    const from = this.config.get<string>('RESEND_FROM_EMAIL');
    if (!from?.trim()) {
      throw new InternalServerErrorException('RESEND_FROM_EMAIL is not configured');
    }
    const key = this.config.get<string>('RESEND_API_KEY');
    if (!key?.trim()) {
      throw new InternalServerErrorException('RESEND_API_KEY is not configured');
    }

    const html = await render(OtpEmail({ otp, villaName }), { pretty: true });
    const { error } = await this.resend.emails.send({
      from: from.trim(),
      to: [to],
      subject: 'Your login code',
      html,
    });
    if (error) {
      throw new InternalServerErrorException(
        `Failed to send email: ${error.message ?? 'unknown error'}`,
      );
    }
  }
}
