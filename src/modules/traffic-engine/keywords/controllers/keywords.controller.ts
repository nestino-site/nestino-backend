import { Body, Controller, Get, Patch, Post, Query, ParseIntPipe } from '@nestjs/common';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { CreateKeywordDto } from '../dto/create-keyword.dto';
import { UpdateKeywordDto } from '../dto/update-keyword.dto';
import { KeywordsService } from '../services/keywords.service';

@Controller('keywords')
export class KeywordsController {
  constructor(private readonly keywordsService: KeywordsService) {}

  @Post()
  create(@Body() dto: CreateKeywordDto) {
    return this.keywordsService.create(dto);
  }

  @Get('cluster')
  findCluster(@Query('baseKeywordId', ParseIntPipe) rootId: number) {
    return this.keywordsService.findCluster(rootId);
  }

  @Get()
  findBySite(@Query('siteId', ParseIntPipe) siteId: number) {
    return this.keywordsService.findBySite(siteId);
  }

  @Get(':id')
  findOne(@ParseIntParam('id') id: number) {
    return this.keywordsService.findOne(id);
  }

  @Patch(':id')
  update(@ParseIntParam('id') id: number, @Body() dto: UpdateKeywordDto) {
    return this.keywordsService.update(id, dto);
  }
}
