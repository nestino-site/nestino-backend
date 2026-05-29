import {
  ContentLanguage,
  HallucinationSensitivity,
  KeywordIntent,
  RiskCategory,
  SubjectStatus,
} from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  siteId!: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  templateId?: number;

  @ApiPropertyOptional({ example: 12, description: 'Pillar page ID for topic cluster' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pillarPageId?: number;

  @ApiProperty({ example: 'IVF in Spain' })
  @IsString()
  title!: string;

  @ApiPropertyOptional({ example: 'Content hub covering IVF costs and clinics in Spain' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [String], example: ['ivf spain', 'ivf cost spain'] })
  @IsArray()
  @IsString({ each: true })
  primaryKeywords!: string[];

  @ApiPropertyOptional({ type: [String], example: ['best ivf clinics spain'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  secondaryKeywords?: string[];

  @ApiPropertyOptional({ enum: KeywordIntent, example: KeywordIntent.COMMERCIAL })
  @IsOptional()
  @IsEnum(KeywordIntent)
  searchIntent?: KeywordIntent;

  @ApiPropertyOptional({ enum: ContentLanguage, example: ContentLanguage.EN })
  @IsOptional()
  @IsEnum(ContentLanguage)
  language?: ContentLanguage;

  @ApiPropertyOptional({ example: 'ES' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'Barcelona' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Rank for commercial IVF queries in Spain' })
  @IsOptional()
  @IsString()
  seoGoal?: string;

  @ApiPropertyOptional({ example: 10, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  contentCountTarget?: number;

  @ApiPropertyOptional({ enum: HallucinationSensitivity, example: HallucinationSensitivity.HIGH })
  @IsOptional()
  @IsEnum(HallucinationSensitivity)
  hallucinationSensitivity?: HallucinationSensitivity;

  @ApiPropertyOptional({ enum: RiskCategory, example: RiskCategory.MEDICAL })
  @IsOptional()
  @IsEnum(RiskCategory)
  riskCategory?: RiskCategory;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  requiresFactualValidation?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  strictReviewMode?: boolean;

  @ApiPropertyOptional({ enum: SubjectStatus, example: SubjectStatus.ACTIVE })
  @IsOptional()
  @IsEnum(SubjectStatus)
  status?: SubjectStatus;
}
