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
import { SiteApiKeyService } from '../services/site-api-key.service';

@Injectable()
export class SiteApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteApiKeyService: SiteApiKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKey(req);
    if (!apiKey) {
      throw new ForbiddenException('Missing X-Site-Api-Key header');
    }

    const pageId = req.params.pageId;
    if (!pageId || typeof pageId !== 'string') {
      throw new ForbiddenException('Page id is required for site API key auth');
    }

    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: { select: { id: true, contentApiKeyHash: true } } },
    });
    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }

    const valid = await this.siteApiKeyService.verify(apiKey, page.site.contentApiKeyHash);
    if (!valid) {
      throw new ForbiddenException('Invalid site API key');
    }

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
