import {
  Controller, Get, Post, Param, Body, Query, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty, ApiQuery } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { InterviewsService } from '../services/interviews.service';
import { StartInterviewDto } from '../dto/start-interview.dto';
import { SubmitAnswerDto } from '../dto/submit-answer.dto';
import { Public } from '../../../identity/decorators/public.decorator';

class VerifyInterviewDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsString()
  declare verifiedBy: string;
}

@ApiTags('Interviews')
@Controller()
export class InterviewsController {
  constructor(private readonly svc: InterviewsService) {}

  @Get('interview-questions')
  @Public()
  @ApiOperation({ summary: 'List all active interview questions (with dimensions)' })
  listQuestions() {
    return this.svc.listQuestions();
  }

  @Post('interviews/start')
  @Public()
  @ApiOperation({ summary: 'Start a new patient interview session' })
  start(@Body() dto: StartInterviewDto) {
    return this.svc.startInterview(dto);
  }

  @Post('interviews/:id/answer')
  @Public()
  @ApiOperation({ summary: 'Submit an answer for a question in an interview session' })
  answer(@Param('id', ParseIntPipe) id: number, @Body() dto: SubmitAnswerDto) {
    return this.svc.submitAnswer(id, dto);
  }

  @Post('interviews/:id/finalize')
  @Public()
  @ApiOperation({ summary: 'Submit interview for review when all answers are complete' })
  finalize(@Param('id', ParseIntPipe) id: number) {
    return this.svc.finalizeInterview(id);
  }

  @Get('admin/interviews')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List interviews (admin)' })
  @ApiQuery({ name: 'clinicId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'IN_REVIEW', 'VERIFIED', 'PUBLISHED', 'REJECTED'] })
  listInterviews(@Query('clinicId') clinicId?: string, @Query('status') status?: string) {
    return this.svc.listInterviews(clinicId ? Number(clinicId) : undefined, status);
  }

  @Get('admin/interviews/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get interview with answers (admin)' })
  getInterview(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getInterview(id);
  }

  @Post('admin/interviews/:id/verify')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark interview as verified (admin)' })
  verify(@Param('id', ParseIntPipe) id: number, @Body() body: VerifyInterviewDto) {
    return this.svc.verifyInterview(id, body.verifiedBy);
  }

  @Post('admin/interviews/:id/publish')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish a verified interview (admin)' })
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publishInterview(id);
  }

  @Post('admin/interviews/:id/reject')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject an interview (admin)' })
  reject(@Param('id', ParseIntPipe) id: number) {
    return this.svc.rejectInterview(id);
  }
}
