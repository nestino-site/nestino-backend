import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ContentLanguage } from '@prisma/client';
import { CreateKeywordResearchDto } from '../dto/create-keyword-research.dto';
import { KeywordResearchService } from '../services/keyword-research.service';

@Controller('keyword-research')
export class KeywordResearchController {
  constructor(private readonly keywordResearchService: KeywordResearchService) {}

  @Post()
  create(@Body() dto: CreateKeywordResearchDto) {
    return this.keywordResearchService.create(dto);
  }

  @Get()
  findAll() {
    return this.keywordResearchService.findAll();
  }

  @Get('enrich')
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
