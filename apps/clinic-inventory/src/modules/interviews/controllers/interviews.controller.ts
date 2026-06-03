import {
  Controller, Get, Post, Param, Body, Query, UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty, ApiQuery } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { InterviewsService } from '../services/interviews.service';
import { StartInterviewDto } from '../dto/start-interview.dto';
import { SubmitAnswerDto } from '../dto/submit-answer.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

class VerifyInterviewDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsString()
  declare verifiedBy: string;
}

@ApiTags('Interviews')
@Controller()
export class InterviewsController {
  constructor(private readonly svc: InterviewsService) {}

  // ── Public read ────────────────────────────────────────────────────────────

  @Get('interview-questions')
  @ApiOperation({ summary: 'List all active interview questions (with dimensions)' })
  listQuestions() {
    return this.svc.listQuestions();
  }

  // ── Patient-facing (no auth — uses aiSessionId for ownership in a real impl) ──

  @Post('interviews/start')
  @ApiOperation({ summary: 'Start a new patient interview session' })
  start(@Body() dto: StartInterviewDto) {
    return this.svc.startInterview(dto);
  }

  @Post('interviews/:id/answer')
  @ApiOperation({ summary: 'Submit an answer for a question in an interview session' })
  answer(@Param('id', ParseIntPipe) id: number, @Body() dto: SubmitAnswerDto) {
    return this.svc.submitAnswer(id, dto);
  }

  @Post('interviews/:id/finalize')
  @ApiOperation({ summary: 'Submit interview for review when all answers are complete' })
  finalize(@Param('id', ParseIntPipe) id: number) {
    return this.svc.finalizeInterview(id);
  }

  // ── Admin ──────────────────────────────────────────────────────────────────

  @Get('admin/interviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List interviews (admin)' })
  @ApiQuery({ name: 'clinicId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'IN_REVIEW', 'VERIFIED', 'PUBLISHED', 'REJECTED'] })
  listInterviews(@Query('clinicId') clinicId?: string, @Query('status') status?: string) {
    return this.svc.listInterviews(clinicId ? Number(clinicId) : undefined, status);
  }

  @Get('admin/interviews/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get interview with answers (admin)' })
  getInterview(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getInterview(id);
  }

  @Post('admin/interviews/:id/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark interview as verified (admin)' })
  verify(@Param('id', ParseIntPipe) id: number, @Body() body: VerifyInterviewDto) {
    return this.svc.verifyInterview(id, body.verifiedBy);
  }

  @Post('admin/interviews/:id/publish')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish a verified interview (admin)' })
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publishInterview(id);
  }

  @Post('admin/interviews/:id/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject an interview (admin)' })
  reject(@Param('id', ParseIntPipe) id: number) {
    return this.svc.rejectInterview(id);
  }
}
