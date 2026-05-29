import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ContentLanguage } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateKeywordResearchDto } from '../dto/create-keyword-research.dto';
import { KeywordResearchService } from '../services/keyword-research.service';

@ApiTags('Keyword Research')
@ApiBearerAuth('bearer')
@Controller('keyword-research')
export class KeywordResearchController {
  constructor(private readonly keywordResearchService: KeywordResearchService) {}

  @Post()
  @ApiOperation({ summary: 'Store keyword research suggestions' })
  @ApiResponse({ status: 201, description: 'Research record created' })
  create(@Body() dto: CreateKeywordResearchDto) {
    return this.keywordResearchService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List keyword research records' })
  findAll() {
    return this.keywordResearchService.findAll();
  }

  @Get('enrich')
  @ApiOperation({ summary: 'Enrich a seed keyword via external provider' })
  @ApiQuery({ name: 'seed', type: String, required: true, example: 'ivf spain' })
  @ApiQuery({ name: 'language', enum: ContentLanguage, required: false, example: ContentLanguage.EN })
  enrich(
    @Query('seed') seed: string,
    @Query('language') language?: ContentLanguage,
  ) {
    return this.keywordResearchService.enrichFromProvider(
      seed,
      language ?? ContentLanguage.EN,
    );
  }
}
