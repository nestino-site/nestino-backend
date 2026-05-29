import { ContentType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty({ example: 'Country Guide' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Long-form destination guide with FAQ and CTA blocks' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ContentType, example: ContentType.ARTICLE })
  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @ApiProperty({
    example: { intro: true, faq: true, cta: true },
    description: 'Required section keys for generated content',
  })
  @IsObject()
  requiredSections!: Record<string, unknown>;

  @ApiProperty({
    example: { h1: 1, h2: '3-6', h3: 'optional' },
  })
  @IsObject()
  headingStructure!: Record<string, unknown>;

  @ApiProperty({
    example: { minWordCount: 1500, keywordDensity: '1-2%' },
  })
  @IsObject()
  seoRules!: Record<string, unknown>;

  @ApiProperty({
    example: { minQuestions: 5, format: 'accordion' },
  })
  @IsObject()
  faqStructure!: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'after_intro' })
  @IsOptional()
  @IsString()
  ctaPlacement?: string;

  @ApiPropertyOptional({ example: { maxLinks: 5, preferPillar: true } })
  @IsOptional()
  @IsObject()
  internalLinkingRules?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'Use short paragraphs and bullet lists for scanability.' })
  @IsOptional()
  @IsString()
  formattingInstructions?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
