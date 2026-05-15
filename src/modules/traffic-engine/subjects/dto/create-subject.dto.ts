import {
  ContentLanguage,
  HallucinationSensitivity,
  KeywordIntent,
  RiskCategory,
  SubjectStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateSubjectDto {
  @Type(() => Number)
  @IsInt()
  siteId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  templateId?: number;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  primaryKeywords!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  secondaryKeywords?: string[];

  @IsOptional()
  @IsEnum(KeywordIntent)
  searchIntent?: KeywordIntent;

  @IsOptional()
  @IsEnum(ContentLanguage)
  language?: ContentLanguage;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  seoGoal?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  contentCountTarget?: number;

  @IsOptional()
  @IsEnum(HallucinationSensitivity)
  hallucinationSensitivity?: HallucinationSensitivity;

  @IsOptional()
  @IsEnum(RiskCategory)
  riskCategory?: RiskCategory;

  @IsOptional()
  @IsBoolean()
  requiresFactualValidation?: boolean;

  @IsOptional()
  @IsBoolean()
  strictReviewMode?: boolean;

  @IsOptional()
  @IsEnum(SubjectStatus)
  status?: SubjectStatus;
}
