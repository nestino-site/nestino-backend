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
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { CreateSubjectDto } from '../dto/create-subject.dto';
import { UpdateSubjectDto } from '../dto/update-subject.dto';
import { SubjectsService } from '../services/subjects.service';

@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  create(@Body() dto: CreateSubjectDto) {
    return this.subjectsService.create(dto);
  }

  @Get()
  findAll(
    @Query('siteId', new ParseIntPipe({ optional: true })) siteId?: number,
    @Query('status') status?: SubjectStatus,
  ) {
    return this.subjectsService.findAll(siteId, status);
  }

  @Get(':id')
  findOne(@ParseIntParam('id') id: number) {
    return this.subjectsService.findOne(id);
  }

  @Patch(':id')
  update(@ParseIntParam('id') id: number, @Body() dto: UpdateSubjectDto) {
    return this.subjectsService.update(id, dto);
  }

  @Delete(':id')
  remove(@ParseIntParam('id') id: number) {
    return this.subjectsService.remove(id);
  }
}
