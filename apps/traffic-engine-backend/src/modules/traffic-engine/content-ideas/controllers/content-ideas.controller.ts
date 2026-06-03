import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { IdeaStatus } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { BulkReviewDto } from '../dto/bulk-review.dto';
import { GenerateIdeasDto } from '../dto/generate-ideas.dto';
import { ReviewIdeaDto } from '../dto/review-idea.dto';
import { ContentIdeasService } from '../services/content-ideas.service';

@ApiTags('Content Ideas')
@ApiBearerAuth('bearer')
@Controller()
export class ContentIdeasController {
  constructor(private readonly contentIdeasService: ContentIdeasService) {}

  @Post('subjects/:subjectId/ideas/generate')
  @ApiOperation({ summary: 'Generate AI content ideas for a subject' })
  @ApiParam({ name: 'subjectId', type: Number, example: 1 })
  @ApiResponse({ status: 201, description: 'Idea generation queued' })
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
  @ApiOperation({ summary: 'List content ideas for a subject' })
  @ApiParam({ name: 'subjectId', type: Number, example: 1 })
  @ApiQuery({ name: 'status', enum: IdeaStatus, required: false })
  listBySubject(
    @ParseIntParam('subjectId') subjectId: number,
    @Query('status') status?: IdeaStatus,
  ) {
    return this.contentIdeasService.findBySubject(subjectId, status);
  }

  @Get('content-ideas/:id')
  @ApiOperation({ summary: 'Get content idea by ID' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  findOne(@ParseIntParam('id') id: number) {
    return this.contentIdeasService.findOne(id);
  }

  @Patch('content-ideas/:id/approve')
  @ApiOperation({ summary: 'Approve a content idea' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  approve(@ParseIntParam('id') id: number, @Body() dto: ReviewIdeaDto) {
    return this.contentIdeasService.approve(id, dto.reviewNotes);
  }

  @Patch('content-ideas/:id/reject')
  @ApiOperation({ summary: 'Reject a content idea' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  reject(@ParseIntParam('id') id: number, @Body() dto: ReviewIdeaDto) {
    return this.contentIdeasService.reject(id, dto.reviewNotes);
  }

  @Patch('content-ideas/:id/request-revision')
  @ApiOperation({ summary: 'Request revision on a content idea' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  requestRevision(@ParseIntParam('id') id: number, @Body() dto: ReviewIdeaDto) {
    return this.contentIdeasService.requestRevision(id, dto.reviewNotes);
  }

  @Post('content-ideas/bulk-approve')
  @ApiOperation({ summary: 'Bulk approve content ideas' })
  @ApiResponse({ status: 201, description: 'Ideas approved' })
  bulkApprove(@Body() dto: BulkReviewDto) {
    return this.contentIdeasService.bulkApprove(dto.ideaIds, dto.reviewNotes);
  }

  @Post('content-ideas/bulk-reject')
  @ApiOperation({ summary: 'Bulk reject content ideas' })
  @ApiResponse({ status: 201, description: 'Ideas rejected' })
  bulkReject(@Body() dto: BulkReviewDto) {
    return this.contentIdeasService.bulkReject(dto.ideaIds, dto.reviewNotes);
  }
}
