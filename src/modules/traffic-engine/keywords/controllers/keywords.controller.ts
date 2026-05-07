import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
  findCluster(@Query('baseKeywordId') rootId: string) {
    return this.keywordsService.findCluster(rootId);
  }

  @Get()
  findBySite(@Query('siteId') siteId: string) {
    return this.keywordsService.findBySite(siteId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.keywordsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateKeywordDto) {
    return this.keywordsService.update(id, dto);
  }
}
