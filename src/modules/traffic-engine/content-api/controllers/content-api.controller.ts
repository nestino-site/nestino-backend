import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { PipelineStatus } from '@prisma/client';
import { ContentStateManagerService } from '../content-state-manager.service';
import { NextJsContractMapperService } from '../next-js-contract-mapper.service';

@Controller('content')
export class ContentApiController {
  constructor(
    private readonly stateManager: ContentStateManagerService,
    private readonly mapper: NextJsContractMapperService,
  ) {}

  @Get(':pageId')
  @HttpCode(HttpStatus.OK)
  async getContent(@Param('pageId') pageId: string) {
    const page = await this.stateManager.getState(pageId);
    const body = this.mapper.toContract(page);
    if (
      page.pipelineStatus !== PipelineStatus.READY &&
      page.pipelineStatus !== PipelineStatus.FAILED
    ) {
      return {
        ...body,
        httpStatus: HttpStatus.ACCEPTED,
      };
    }
    return body;
  }

  @Get(':pageId/logs')
  async getLogs(@Param('pageId') pageId: string) {
    const page = await this.stateManager.getState(pageId);
    return {
      pageId,
      logs: page.aiGenerationLogs,
    };
  }
}
