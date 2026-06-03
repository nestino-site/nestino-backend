import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { SubjectStatus } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { CreateSubjectDto } from '../dto/create-subject.dto';
import { UpdateSubjectDto } from '../dto/update-subject.dto';
import { SubjectsService } from '../services/subjects.service';

@ApiTags('Subjects')
@ApiBearerAuth('bearer')
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an editorial subject / topic hub' })
  @ApiResponse({ status: 201, description: 'Subject created' })
  create(@Body() dto: CreateSubjectDto) {
    return this.subjectsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List subjects' })
  @ApiQuery({ name: 'siteId', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'status', enum: SubjectStatus, required: false })
  findAll(
    @Query('siteId', new ParseIntPipe({ optional: true })) siteId?: number,
    @Query('status') status?: SubjectStatus,
  ) {
    return this.subjectsService.findAll(siteId, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get subject by ID' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  findOne(@ParseIntParam('id') id: number) {
    return this.subjectsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update subject' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  update(@ParseIntParam('id') id: number, @Body() dto: UpdateSubjectDto) {
    return this.subjectsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete subject' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  remove(@ParseIntParam('id') id: number) {
    return this.subjectsService.remove(id);
  }
}
