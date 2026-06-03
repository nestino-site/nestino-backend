import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PasswordService } from './password.service';
import { IdentityJwtService } from './identity-jwt.service';

export interface LoginResult {
  accessToken: string;
  expiresIn: string;
  user: {
    id: number;
    email: string;
    displayName: string | null;
    role: PlatformUser['role'];
  };
}

@Injectable()
export class IdentityAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: IdentityJwtService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.platformUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user?.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await this.passwordService.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.platformUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwtService.signAccessToken({
      sub: String(user.id),
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      expiresIn: this.jwtService.getAccessExpiresIn(),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }

  async getProfile(userId: number): Promise<LoginResult['user']> {
    const user = await this.prisma.platformUser.findUnique({ where: { id: userId } });
    if (!user?.isActive) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  }
}
