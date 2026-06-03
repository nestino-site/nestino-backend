import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformRole } from '@prisma/client';
import { jwtVerify, SignJWT } from 'jose';
import type { Request } from 'express';
import type { IdentityJwtPayload } from '../types/identity-jwt-payload.type';

function getEncodedSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

@Injectable()
export class IdentityJwtService {
  constructor(private readonly config: ConfigService) {}

  private get accessSecret(): Uint8Array {
    const s = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!s?.trim()) {
      throw new Error('JWT_ACCESS_SECRET is not configured');
    }
    return getEncodedSecret(s);
  }

  getAccessExpiresIn(): string {
    return this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '8h';
  }

  async signAccessToken(payload: {
    sub: string;
    email: string;
    role: PlatformRole;
  }): Promise<string> {
    return new SignJWT({
      email: payload.email,
      role: payload.role,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime(this.getAccessExpiresIn())
      .sign(this.accessSecret);
  }

  extractToken(req: Request): string | null {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice(7).trim();
      return token || null;
    }
    return null;
  }

  async verifyAccessToken(token: string): Promise<IdentityJwtPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.accessSecret, {
        algorithms: ['HS256'],
      });
      const sub = typeof payload.sub === 'string' ? payload.sub : undefined;
      const email = typeof payload.email === 'string' ? payload.email : undefined;
      const role =
        payload.role === PlatformRole.ADMIN ? PlatformRole.ADMIN : undefined;
      if (!sub || !email || !role) {
        return null;
      }
      return { sub, email, role };
    } catch {
      return null;
    }
  }

  async verifyFromRequest(req: Request): Promise<IdentityJwtPayload | null> {
    const token = this.extractToken(req);
    if (!token) {
      return null;
    }
    return this.verifyAccessToken(token);
  }
}
