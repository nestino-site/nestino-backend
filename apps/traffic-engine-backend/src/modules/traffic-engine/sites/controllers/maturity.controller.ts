import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { MaturityGateService } from '../../analytics/maturity-gate.service';

@ApiTags('Sites')
@ApiBearerAuth('bearer')
@Controller('sites')
export class MaturityController {
  constructor(private readonly maturityGate: MaturityGateService) {}

  @Get(':id/maturity')
  @ApiOperation({ summary: 'Get site automation maturity status and progress' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Maturity status' })
  getStatus(@ParseIntParam('id') siteId: number) {
    return this.maturityGate.getStatus(siteId);
  }

  @Post(':id/maturity/unlock')
  @ApiOperation({ summary: 'Manually unlock SEO automation for a site' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  unlock(@ParseIntParam('id') siteId: number) {
    return this.maturityGate.unlock(siteId);
  }

  @Post(':id/maturity/lock')
  @ApiOperation({ summary: 'Manually lock SEO automation for a site' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  lock(@ParseIntParam('id') siteId: number) {
    return this.maturityGate.lock(siteId);
  }
}
