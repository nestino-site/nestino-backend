import { Body, Controller, Get, Post, Query, ParseIntPipe } from '@nestjs/common';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { CreateIdeaTaskDto } from '../dto/create-idea-task.dto';
import { IdeaTasksService } from '../services/idea-tasks.service';

@Controller()
export class IdeaTasksController {
  constructor(private readonly ideaTasksService: IdeaTasksService) {}

  @Post('content-ideas/:ideaId/create-task')
  createFromIdea(@ParseIntParam('ideaId') ideaId: number, @Body() dto: CreateIdeaTaskDto) {
    return this.ideaTasksService.createFromApprovedIdea(ideaId, dto);
  }

  @Get('idea-tasks')
  findAll(@Query('subjectId', new ParseIntPipe({ optional: true })) subjectId?: number) {
    return this.ideaTasksService.findAll(subjectId);
  }

  @Get('idea-tasks/:id')
  findOne(@ParseIntParam('id') id: number) {
    return this.ideaTasksService.findOne(id);
  }
}
