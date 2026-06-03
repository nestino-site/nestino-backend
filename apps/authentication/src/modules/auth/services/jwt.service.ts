import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '../auth.constants';
import type { AuthUserPayload } from '../auth.types';

function parseDurationToMs(value: string | undefined, fallbackMs: number): number {
  if (!value?.trim()) return fallbackMs;
  const m = /^(\d+)(s|m|h|d)$/i.exec(value.trim());
  if (!m) return fallbackMs;
  const n = parseInt(m[1], 10);
  switch (m[2].toLowerCase()) {
    case 's':
      return n * 1000;
    case 'm':
      return n * 60 * 1000;
    case 'h':
      return n * 60 * 60 * 1000;
    case 'd':
      return n * 24 * 60 * 60 * 1000;
    default:
      return fallbackMs;
  }
}

function getEncodedSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

@Injectable()
export class JwtService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get accessSecret(): Uint8Array {
    const s = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!s?.trim()) {
      throw new Error('JWT_ACCESS_SECRET is not configured');
    }
    return getEncodedSecret(s);
  }

  private get refreshSecret(): Uint8Array {
    const s = this.config.get<string>('JWT_REFRESH_SECRET');
    if (!s?.trim()) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }
    return getEncodedSecret(s);
  }

  private buildCookieOptions(isProduction: boolean): {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict';
    path: string;
  } {
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
    };
  }

  async signAccessToken(payload: AuthUserPayload): Promise<string> {
    const exp = this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
    return await new SignJWT({
      email: payload.email,
      villaId: payload.villaId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(this.accessSecret);
  }

  async signRefreshToken(userId: string, villaId: string, jti: string): Promise<string> {
    const exp = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d';
    return await new SignJWT({ villaId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(this.refreshSecret);
  }

  async verifyAccessTokenFromRequest(req: Request): Promise<AuthUserPayload | null> {
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
    if (!token || typeof token !== 'string') {
      return null;
    }
    try {
      const { payload } = await jwtVerify(token, this.accessSecret, {
        algorithms: ['HS256'],
      });
      const sub = typeof payload.sub === 'string' ? payload.sub : undefined;
      const email = typeof payload.email === 'string' ? payload.email : undefined;
      const villaId = typeof payload.villaId === 'string' ? payload.villaId : undefined;
      if (!sub || !email || !villaId) {
        return null;
      }
      return { sub, email, villaId };
    } catch {
      return null;
    }
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const opts = this.buildCookieOptions(isProd);
    const accessMs = parseDurationToMs(this.config.get<string>('JWT_ACCESS_EXPIRES_IN'), 15 * 60 * 1000);
    const refreshMs = parseDurationToMs(
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN'),
      30 * 24 * 60 * 60 * 1000,
    );
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, { ...opts, maxAge: accessMs });
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, { ...opts, maxAge: refreshMs });
  }

  clearAuthCookies(res: Response): void {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const opts = this.buildCookieOptions(isProd);
    res.clearCookie(ACCESS_TOKEN_COOKIE, opts);
    res.clearCookie(REFRESH_TOKEN_COOKIE, opts);
  }

  async issueTokensForUser(userId: string, email: string, villaId: string, res: Response): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { villaUserId: userId } });

    const jti = randomUUID();
    const access = await this.signAccessToken({ sub: userId, email, villaId });
    const refresh = await this.signRefreshToken(userId, villaId, jti);
    const tokenHash = await bcrypt.hash(refresh, 10);
    const refreshMs = parseDurationToMs(
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN'),
      30 * 24 * 60 * 60 * 1000,
    );
    const expiresAt = new Date(Date.now() + refreshMs);

    await this.prisma.refreshToken.create({
      data: {
        jti,
        tokenHash,
        villaUserId: userId,
        expiresAt,
      },
    });

    this.setAuthCookies(res, access, refresh);
  }

  async rotateRefreshToken(refreshTokenPlain: string, res: Response): Promise<void> {
    let userId: string;
    let villaId: string;
    let jti: string;
    try {
      const { payload } = await jwtVerify(refreshTokenPlain, this.refreshSecret, {
        algorithms: ['HS256'],
      });
      const sub = typeof payload.sub === 'string' ? payload.sub : undefined;
      const vid = typeof payload.villaId === 'string' ? payload.villaId : undefined;
      const jtiClaim = typeof payload.jti === 'string' ? payload.jti : undefined;
      if (!sub || !vid || !jtiClaim) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      userId = sub;
      villaId = vid;
      jti = jtiClaim;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid refresh token');
    }

    const existing = await this.prisma.refreshToken.findUnique({
      where: { jti },
      include: { villaUser: true },
    });
    if (!existing || existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token revoked or expired');
    }

    const matches = await bcrypt.compare(refreshTokenPlain, existing.tokenHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.villaUser.villaId !== villaId || existing.villaUser.id !== userId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = existing.villaUser;
    await this.prisma.refreshToken.delete({ where: { id: existing.id } });

    await this.issueTokensForUser(user.id, user.email, user.villaId, res);
  }

  async revokeAllRefreshTokensForUser(userId: string, res: Response): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { villaUserId: userId } });
    this.clearAuthCookies(res);
  }
}
