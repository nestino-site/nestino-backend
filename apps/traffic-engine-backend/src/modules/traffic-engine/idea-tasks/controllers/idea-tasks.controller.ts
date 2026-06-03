import { Body, Controller, Get, Post, Query, ParseIntPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { CreateIdeaTaskDto } from '../dto/create-idea-task.dto';
import { IdeaTasksService } from '../services/idea-tasks.service';

@ApiTags('Idea Tasks')
@ApiBearerAuth('bearer')
@Controller()
export class IdeaTasksController {
  constructor(private readonly ideaTasksService: IdeaTasksService) {}

  @Post('content-ideas/:ideaId/create-task')
  @ApiOperation({ summary: 'Create a content task from an approved idea' })
  @ApiParam({ name: 'ideaId', type: Number, example: 1 })
  @ApiResponse({ status: 201, description: 'Task created from idea' })
  createFromIdea(@ParseIntParam('ideaId') ideaId: number, @Body() dto: CreateIdeaTaskDto) {
    return this.ideaTasksService.createFromApprovedIdea(ideaId, dto);
  }

  @Get('idea-tasks')
  @ApiOperation({ summary: 'List idea tasks' })
  @ApiQuery({ name: 'subjectId', type: Number, required: false, example: 1 })
  findAll(@Query('subjectId', new ParseIntPipe({ optional: true })) subjectId?: number) {
    return this.ideaTasksService.findAll(subjectId);
  }

  @Get('idea-tasks/:id')
  @ApiOperation({ summary: 'Get idea task by ID' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  findOne(@ParseIntParam('id') id: number) {
    return this.ideaTasksService.findOne(id);
  }
}
