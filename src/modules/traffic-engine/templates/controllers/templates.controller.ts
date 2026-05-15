import { Body, Controller, Delete, Get, Patch, Post } from '@nestjs/common';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { UpdateTemplateDto } from '../dto/update-template.dto';
import { TemplatesService } from '../services/templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  create(@Body() dto: CreateTemplateDto) {
    return this.templatesService.create(dto);
  }

  @Get()
  findAll() {
    return this.templatesService.findAll();
  }

  @Get(':id')
  findOne(@ParseIntParam('id') id: number) {
    return this.templatesService.findOne(id);
  }

  @Patch(':id')
  update(@ParseIntParam('id') id: number, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(id, dto);
  }

  @Delete(':id')
  remove(@ParseIntParam('id') id: number) {
    return this.templatesService.remove(id);
  }
}
