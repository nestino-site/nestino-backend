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
import { CreateContentTaskDto } from '../dto/create-content-task.dto';
import { ContentTasksService } from '../services/content-tasks.service';

@ApiTags('Content Tasks')
@ApiBearerAuth('bearer')
@Controller('content-tasks')
export class ContentTasksController {
  constructor(private readonly contentTasksService: ContentTasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create and enqueue a content generation task' })
  @ApiResponse({ status: 201, description: 'Task created' })
  create(@Body() dto: CreateContentTaskDto) {
    return this.contentTasksService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List content tasks' })
  @ApiQuery({ name: 'siteId', type: Number, required: false, example: 1 })
  findAll(@Query('siteId', new ParseIntPipe({ optional: true })) siteId?: number) {
    return this.contentTasksService.findAll(siteId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get content task by ID' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  findOne(@ParseIntParam('id') id: number) {
    return this.contentTasksService.findOne(id);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a failed content task' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 201, description: 'Task re-queued' })
  retry(@ParseIntParam('id') id: number) {
    return this.contentTasksService.retryFailedTask(id);
  }
}
