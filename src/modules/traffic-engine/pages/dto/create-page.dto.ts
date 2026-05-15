import { ContentLanguage, PageStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class CreatePageDto {
  @Type(() => Number)
  @IsInt()
  siteId!: number;

  @Type(() => Number)
  @IsInt()
  keywordId!: number;

  @IsString()
  slug!: string;

  @IsOptional()
  @IsEnum(ContentLanguage)
  language?: ContentLanguage;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  finalContent?: string;

  @IsOptional()
  @IsEnum(PageStatus)
  status?: PageStatus;
}
