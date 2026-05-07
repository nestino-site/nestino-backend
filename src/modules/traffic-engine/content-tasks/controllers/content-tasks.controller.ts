import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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
  findAll(@Query('siteId') siteId?: string) {
    return this.contentTasksService.findAll(siteId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contentTasksService.findOne(id);
  }
}
