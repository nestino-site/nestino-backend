import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { PipelineStatus } from '@prisma/client';
import { SiteApiKey } from '../../../identity/decorators/site-api-key.decorator';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { ContentStateManagerService } from '../content-state-manager.service';
import { NextJsContractMapperService } from '../next-js-contract-mapper.service';

@Controller('content')
@SiteApiKey()
export class ContentApiController {
  constructor(
    private readonly stateManager: ContentStateManagerService,
    private readonly mapper: NextJsContractMapperService,
  ) {}

  @Get(':pageId')
  @HttpCode(HttpStatus.OK)
  async getContent(@ParseIntParam('pageId') pageId: number) {
    const page = await this.stateManager.getState(pageId);
    const body = await this.mapper.toContract(page);
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
  async getLogs(@ParseIntParam('pageId') pageId: number) {
    const page = await this.stateManager.getState(pageId);
    return {
      pageId,
      logs: page.aiGenerationLogs,
    };
  }
}
