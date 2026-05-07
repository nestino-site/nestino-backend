import { Body, Controller, Get, Post } from '@nestjs/common';
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
}
