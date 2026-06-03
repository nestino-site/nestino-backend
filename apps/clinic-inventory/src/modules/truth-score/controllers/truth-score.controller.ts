import { Controller, Get, Post, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TruthScoreService } from '../services/truth-score.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

@ApiTags('Truth Score')
@Controller()
export class TruthScoreController {
  constructor(private readonly svc: TruthScoreService) {}

  @Get('clinics/:id/truth-score')
  @ApiOperation({ summary: 'Get current Truth Score for a clinic' })
  getScore(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getScore(id);
  }

  @Get('clinics/:id/truth-score/history')
  @ApiOperation({ summary: 'Get Truth Score snapshot history for a clinic' })
  getHistory(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getScoreHistory(id);
  }

  @Post('admin/truth-score/:clinicId/recompute')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Force recompute Truth Score for a clinic (admin)' })
  async recompute(@Param('clinicId', ParseIntPipe) clinicId: number) {
    await this.svc.computeForClinic(clinicId);
    return this.svc.getScore(clinicId);
  }
}
