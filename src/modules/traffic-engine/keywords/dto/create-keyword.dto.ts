import { ContentLanguage, KeywordIntent, KeywordStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateKeywordDto {
  @IsString()
  siteId!: string;

  @IsString()
  keyword!: string;

  @IsOptional()
  @IsEnum(ContentLanguage)
  language?: ContentLanguage;

  @IsOptional()
  @IsString()
  baseKeywordId?: string;

  @IsOptional()
  @IsEnum(KeywordIntent)
  intent?: KeywordIntent;

  @IsOptional()
  @IsEnum(KeywordStatus)
  status?: KeywordStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  searchVolume?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  difficulty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cpc?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  targetUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
