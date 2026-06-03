import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SITE_API_KEY_HEADER } from '../identity.constants';
import { SiteApiKeyAuthCacheService } from '../services/site-api-key-auth-cache.service';
import { SiteApiKeyService } from '../services/site-api-key.service';

@Injectable()
export class SiteApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteApiKeyService: SiteApiKeyService,
    private readonly authCache: SiteApiKeyAuthCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKey(req);
    if (!apiKey) {
      throw new ForbiddenException('Missing X-Site-Api-Key header');
    }

    const pageIdRaw = req.params.pageId;
    const pageId = Number(pageIdRaw);
    if (!pageIdRaw || !Number.isInteger(pageId) || pageId < 1) {
      throw new ForbiddenException('Page id is required for site API key auth');
    }

    const cachedSiteId = await this.authCache.getPageSiteId(apiKey, pageId);
    if (cachedSiteId) {
      req.siteId = cachedSiteId;
      return true;
    }

    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: { select: { id: true, contentApiKeyHash: true } } },
    });
    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }

    const verification = await this.siteApiKeyService.verifyDetailed(
      apiKey,
      page.site.contentApiKeyHash,
    );
    if (!verification.valid) {
      throw new ForbiddenException('Invalid site API key');
    }

    if (verification.upgradedHash) {
      await this.prisma.site.update({
        where: { id: page.site.id },
        data: { contentApiKeyHash: verification.upgradedHash },
      });
    }

    await this.authCache.setPageSiteId(apiKey, pageId, page.site.id);
    req.siteId = page.site.id;
    return true;
  }

  private extractApiKey(req: Request): string | null {
    const raw = req.headers[SITE_API_KEY_HEADER];
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
    if (Array.isArray(raw) && raw[0]?.trim()) {
      return raw[0].trim();
    }
    return null;
  }
}
