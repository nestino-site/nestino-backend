import {
  Controller, Get, Post, Param, Body, Query, UseGuards, ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiPropertyOptional,
} from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { DiscoveryService } from '../services/discovery.service';
import { StartRunDto } from '../dto/start-run.dto';
import { QuickDiscoveryDto } from '../dto/quick-discovery.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

class RejectCandidateDto {
  @ApiPropertyOptional({ example: 'Duplicate listing or not an IVF clinic' })
  @IsOptional()
  @IsString()
  declare notes?: string;
}

@ApiTags('Discovery')
@Controller('discovery')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DiscoveryController {
  constructor(private readonly svc: DiscoveryService) {}

  @Post('runs')
  @ApiOperation({ summary: 'Start a discovery run for a city' })
  startRun(@Body() dto: StartRunDto) {
    return this.svc.startRun(dto);
  }

  @Post('quick')
  @ApiOperation({ summary: 'Run one-step discovery for a city, clinic type, and count' })
  quickDiscovery(@Body() dto: QuickDiscoveryDto) {
    return this.svc.quickDiscovery(dto);
  }

  @Get('runs')
  @ApiOperation({ summary: 'List discovery runs' })
  @ApiQuery({ name: 'cityId', required: false, type: Number })
  listRuns(@Query('cityId') cityId?: string) {
    return this.svc.listRuns(cityId ? Number(cityId) : undefined);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Get discovery run by id' })
  getRun(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getRun(id);
  }

  @Get('candidates')
  @ApiOperation({ summary: 'List candidates with optional filters' })
  @ApiQuery({ name: 'runId', required: false, type: Number })
  @ApiQuery({ name: 'cityId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['NEW', 'ENRICHING', 'READY_FOR_REVIEW', 'AUTO_PUBLISHED', 'REJECTED', 'FAILED'] })
  listCandidates(
    @Query('runId') runId?: string,
    @Query('cityId') cityId?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.listCandidates(
      runId ? Number(runId) : undefined,
      cityId ? Number(cityId) : undefined,
      status,
    );
  }

  @Post('candidates/:id/approve')
  @ApiOperation({ summary: 'Approve candidate and create clinic' })
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.svc.approveCandidate(id);
  }

  @Post('candidates/:id/reject')
  @ApiOperation({ summary: 'Reject candidate' })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RejectCandidateDto,
  ) {
    return this.svc.rejectCandidate(id, body.notes);
  }
}
