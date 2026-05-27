import {
  Body,
  Controller,
  NotFoundException,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { AuditContentDto } from '../dto/audit-content.dto';
import { GeminiAuditService } from '../services/gemini-audit.service';

@Controller('pages')
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiAudit: GeminiAuditService,
  ) {}

  /**
   * Manual YMYL content audit for a page. Does not persist results (pipeline seo_check does).
   * Optional body.content overrides DB content for spot-checking drafts.
   */
  @Post(':id/audit')
  async auditPage(@ParseIntParam('id') pageId: number, @Body() dto: AuditContentDto) {
    const contentFromBody = dto.content?.trim();
    if (contentFromBody) {
      return this.geminiAudit.auditContent(contentFromBody);
    }

    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: { id: true, finalContent: true, rawDraft: true },
    });
    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }

    const content = (page.finalContent ?? page.rawDraft)?.trim();
    if (!content) {
      throw new UnprocessableEntityException(
        'Page has no content to audit — provide content in the request body or generate content first',
      );
    }

    return this.geminiAudit.auditContent(content);
  }
}
