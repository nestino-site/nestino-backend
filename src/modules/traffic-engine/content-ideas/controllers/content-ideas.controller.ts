import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { IdeaStatus } from '@prisma/client';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { BulkReviewDto } from '../dto/bulk-review.dto';
import { GenerateIdeasDto } from '../dto/generate-ideas.dto';
import { ReviewIdeaDto } from '../dto/review-idea.dto';
import { ContentIdeasService } from '../services/content-ideas.service';

@Controller()
export class ContentIdeasController {
  constructor(private readonly contentIdeasService: ContentIdeasService) {}

  @Post('subjects/:subjectId/ideas/generate')
  generateForSubject(
    @ParseIntParam('subjectId') subjectId: number,
    @Body() dto: GenerateIdeasDto,
  ) {
    return this.contentIdeasService.enqueueGeneration(
      subjectId,
      dto.count,
      dto.provider,
    );
  }

  @Get('subjects/:subjectId/ideas')
  listBySubject(
    @ParseIntParam('subjectId') subjectId: number,
    @Query('status') status?: IdeaStatus,
  ) {
    return this.contentIdeasService.findBySubject(subjectId, status);
  }

  @Get('content-ideas/:id')
  findOne(@ParseIntParam('id') id: number) {
    return this.contentIdeasService.findOne(id);
  }

  @Patch('content-ideas/:id/approve')
  approve(@ParseIntParam('id') id: number, @Body() dto: ReviewIdeaDto) {
    return this.contentIdeasService.approve(id, dto.reviewNotes);
  }

  @Patch('content-ideas/:id/reject')
  reject(@ParseIntParam('id') id: number, @Body() dto: ReviewIdeaDto) {
    return this.contentIdeasService.reject(id, dto.reviewNotes);
  }

  @Patch('content-ideas/:id/request-revision')
  requestRevision(@ParseIntParam('id') id: number, @Body() dto: ReviewIdeaDto) {
    return this.contentIdeasService.requestRevision(id, dto.reviewNotes);
  }

  @Post('content-ideas/bulk-approve')
  bulkApprove(@Body() dto: BulkReviewDto) {
    return this.contentIdeasService.bulkApprove(dto.ideaIds, dto.reviewNotes);
  }

  @Post('content-ideas/bulk-reject')
  bulkReject(@Body() dto: BulkReviewDto) {
    return this.contentIdeasService.bulkReject(dto.ideaIds, dto.reviewNotes);
  }
}
