import { randomInt, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { OTP_MAX_ATTEMPTS } from '../auth.constants';
import { RequestOtpDto } from '../dto/request-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { EmailService } from './email.service';
import { JwtService } from './jwt.service';

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly jwt: JwtService,
  ) {}

  async requestOtp(dto: RequestOtpDto): Promise<{ sent: boolean }> {
    const email = dto.email.trim().toLowerCase();
    const villaId = dto.villaId.trim();
    const code = String(randomInt(100_000, 1_000_000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.prisma.otp.deleteMany({ where: { email, villaId } });
    await this.prisma.otp.create({
      data: { email, villaId, code, expiresAt, attempts: 0 },
    });

    await this.email.sendOtpEmail(dto.email, code, dto.villaName);
    return { sent: true };
  }

  async verifyOtp(dto: VerifyOtpDto, res: Response): Promise<{ ok: boolean }> {
    const email = dto.email.trim().toLowerCase();
    const villaId = dto.villaId.trim();

    const record = await this.prisma.otp.findFirst({
      where: { email, villaId },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      await this.prisma.otp.delete({ where: { id: record.id } });
      throw new UnauthorizedException('Invalid or expired code');
    }

    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await this.prisma.otp.delete({ where: { id: record.id } });
      throw new UnauthorizedException('Too many attempts');
    }

    const a = Buffer.from(dto.otp, 'utf8');
    const b = Buffer.from(record.code, 'utf8');
    const ok =
      a.length === b.length &&
      a.length > 0 &&
      timingSafeEqual(a, b);

    if (!ok) {
      await this.prisma.otp.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid or expired code');
    }

    await this.prisma.otp.delete({ where: { id: record.id } });

    const user = await this.prisma.villaUser.upsert({
      where: { email_villaId: { email, villaId } },
      create: { email, villaId },
      update: {},
    });

    await this.jwt.issueTokensForUser(user.id, user.email, user.villaId, res);
    return { ok: true };
  }
}
