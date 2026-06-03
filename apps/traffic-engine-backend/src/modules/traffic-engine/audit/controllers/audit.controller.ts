import {
  Body,
  Controller,
  NotFoundException,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { AuditContentDto } from '../dto/audit-content.dto';
import { GeminiAuditService } from '../services/gemini-audit.service';

@ApiTags('Pages')
@ApiBearerAuth('bearer')
@Controller('pages')
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiAudit: GeminiAuditService,
  ) {}

  /**
   * Manual YMYL audit-and-fix. Always persists the best finalContent and contentAuditResult.
   * Optional body.content overrides DB content for the audit input.
   */
  @Post(':id/audit')
  @ApiOperation({ summary: 'Run YMYL content audit and auto-fix on a page' })
  @ApiParam({ name: 'id', type: Number, example: 100 })
  @ApiResponse({ status: 201, description: 'Audit result with optional fixed content' })
  async auditPage(@ParseIntParam('id') pageId: number, @Body() dto: AuditContentDto) {
    const contentFromBody = dto.content?.trim();
    let content: string;

    if (contentFromBody) {
      content = contentFromBody;
    } else {
      const page = await this.prisma.page.findUnique({
        where: { id: pageId },
        select: { id: true, finalContent: true, rawDraft: true },
      });
      if (!page) {
        throw new NotFoundException(`Page ${pageId} not found`);
      }
      const fromDb = (page.finalContent ?? page.rawDraft)?.trim();
      if (!fromDb) {
        throw new UnprocessableEntityException(
          'Page has no content to audit — provide content in the request body or generate content first',
        );
      }
      content = fromDb;
    }

    const result = await this.geminiAudit.auditAndImproveContent(content);
    const wordCount = result.finalContent.split(/\s+/).filter(Boolean).length;

    await this.prisma.page.update({
      where: { id: pageId },
      data: {
        finalContent: result.finalContent,
        rawDraft: result.finalContent,
        wordCount,
        contentAuditResult: {
          ...result.auditResult,
          contentChanged: result.contentChanged,
          fixAttempts: result.fixAttempts,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      ...result.auditResult,
      finalContent: result.finalContent,
      contentChanged: result.contentChanged,
      fixAttempts: result.fixAttempts,
    };
  }
}
