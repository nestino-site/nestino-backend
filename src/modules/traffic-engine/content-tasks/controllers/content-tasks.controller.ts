import { Body, Controller, Get, Post, Query, ParseIntPipe } from '@nestjs/common';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { CreateContentTaskDto } from '../dto/create-content-task.dto';
import { ContentTasksService } from '../services/content-tasks.service';

@Controller('content-tasks')
export class ContentTasksController {
  constructor(private readonly contentTasksService: ContentTasksService) {}

  @Post()
  create(@Body() dto: CreateContentTaskDto) {
    return this.contentTasksService.create(dto);
  }

  @Get()
  findAll(@Query('siteId', new ParseIntPipe({ optional: true })) siteId?: number) {
    return this.contentTasksService.findAll(siteId);
  }

  @Get(':id')
  findOne(@ParseIntParam('id') id: number) {
    return this.contentTasksService.findOne(id);
  }
}
