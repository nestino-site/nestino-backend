import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SITE_API_KEY_HEADER, SITE_ID_HEADER } from '../identity.constants';
import { SiteApiKeyService } from '../services/site-api-key.service';

@Injectable()
export class SiteScopedApiKeyGuard implements CanActivate {
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

    const siteId = this.extractSiteId(req);
    if (!siteId) {
      throw new ForbiddenException('Missing X-Site-Id header or siteId query parameter');
    }

    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, contentApiKeyHash: true },
    });
    if (!site) {
      throw new NotFoundException(`Site ${siteId} not found`);
    }

    const valid = await this.siteApiKeyService.verify(apiKey, site.contentApiKeyHash);
    if (!valid) {
      throw new ForbiddenException('Invalid site API key');
    }

    req.siteId = site.id;
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

  private extractSiteId(req: Request): number | null {
    const header = req.headers[SITE_ID_HEADER];
    const fromHeader =
      typeof header === 'string' ? Number(header) : Array.isArray(header) ? Number(header[0]) : NaN;
    if (Number.isInteger(fromHeader) && fromHeader > 0) {
      return fromHeader;
    }

    const query = req.query.siteId;
    const fromQuery = typeof query === 'string' ? Number(query) : NaN;
    if (Number.isInteger(fromQuery) && fromQuery > 0) {
      return fromQuery;
    }

    return null;
  }
}
