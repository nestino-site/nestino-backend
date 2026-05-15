import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PlatformRole } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PasswordService } from './password.service';

/**
 * Creates or updates the platform admin from ADMIN_EMAIL / ADMIN_PASSWORD on startup.
 * Safe to run every deploy (upsert). Skips when env vars are unset.
 */
@Injectable()
export class IdentityBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(IdentityBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      this.logger.log('ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping platform admin bootstrap');
      return;
    }

    const passwordHash = await this.passwordService.hash(password);
    const user = await this.prisma.platformUser.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        role: PlatformRole.ADMIN,
        displayName: 'Platform Admin',
      },
      update: {
        passwordHash,
        isActive: true,
      },
    });

    this.logger.log(`Platform admin ready: ${user.email}`);
  }
}
