import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreateIdeaTaskDto } from '../dto/create-idea-task.dto';
import { IdeaTasksService } from '../services/idea-tasks.service';

@Controller()
export class IdeaTasksController {
  constructor(private readonly ideaTasksService: IdeaTasksService) {}

  @Post('content-ideas/:ideaId/create-task')
  createFromIdea(@Param('ideaId') ideaId: string, @Body() dto: CreateIdeaTaskDto) {
    return this.ideaTasksService.createFromApprovedIdea(ideaId, dto);
  }

  @Get('idea-tasks')
  findAll(@Query('subjectId') subjectId?: string) {
    return this.ideaTasksService.findAll(subjectId);
  }

  @Get('idea-tasks/:id')
  findOne(@Param('id') id: string) {
    return this.ideaTasksService.findOne(id);
  }
}
