import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, IS_SITE_API_KEY_KEY } from '../identity.constants';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SiteApiKeyGuard } from './site-api-key.guard';

@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly siteApiKeyGuard: SiteApiKeyGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const isSiteApiKey = this.reflector.getAllAndOverride<boolean>(IS_SITE_API_KEY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isSiteApiKey) {
      return this.siteApiKeyGuard.canActivate(context);
    }

    return this.jwtAuthGuard.canActivate(context);
  }
}
