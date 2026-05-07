import { ContentLanguage, PageStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreatePageDto {
  @IsString()
  siteId!: string;

  @IsString()
  keywordId!: string;

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
