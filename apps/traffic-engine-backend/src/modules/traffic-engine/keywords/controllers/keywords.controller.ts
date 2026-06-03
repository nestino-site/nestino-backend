import { Body, Controller, Get, Patch, Post, Query, ParseIntPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { CreateKeywordDto } from '../dto/create-keyword.dto';
import { UpdateKeywordDto } from '../dto/update-keyword.dto';
import { KeywordsService } from '../services/keywords.service';

@ApiTags('Keywords')
@ApiBearerAuth('bearer')
@Controller('keywords')
export class KeywordsController {
  constructor(private readonly keywordsService: KeywordsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a keyword' })
  @ApiResponse({ status: 201, description: 'Keyword created' })
  create(@Body() dto: CreateKeywordDto) {
    return this.keywordsService.create(dto);
  }

  @Get('cluster')
  @ApiOperation({ summary: 'Get keyword cluster by base keyword ID' })
  @ApiQuery({ name: 'baseKeywordId', type: Number, required: true, example: 10 })
  findCluster(@Query('baseKeywordId', ParseIntPipe) rootId: number) {
    return this.keywordsService.findCluster(rootId);
  }

  @Get()
  @ApiOperation({ summary: 'List keywords for a site' })
  @ApiQuery({ name: 'siteId', type: Number, required: true, example: 1 })
  findBySite(@Query('siteId', ParseIntPipe) siteId: number) {
    return this.keywordsService.findBySite(siteId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get keyword by ID' })
  @ApiParam({ name: 'id', type: Number, example: 42 })
  findOne(@ParseIntParam('id') id: number) {
    return this.keywordsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update keyword' })
  @ApiParam({ name: 'id', type: Number, example: 42 })
  update(@ParseIntParam('id') id: number, @Body() dto: UpdateKeywordDto) {
    return this.keywordsService.update(id, dto);
  }
}
