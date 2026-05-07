import { ContentLanguage, KeywordResearchSource } from '@prisma/client';
import { IsArray, IsEnum, IsString } from 'class-validator';

export class CreateKeywordResearchDto {
  @IsString()
  seedKeyword!: string;

  @IsEnum(ContentLanguage)
  language!: ContentLanguage;

  @IsArray()
  @IsString({ each: true })
  suggestions!: string[];

  @IsEnum(KeywordResearchSource)
  source!: KeywordResearchSource;
}
