import { ContentType } from '@prisma/client';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @IsObject()
  requiredSections!: Record<string, unknown>;

  @IsObject()
  headingStructure!: Record<string, unknown>;

  @IsObject()
  seoRules!: Record<string, unknown>;

  @IsObject()
  faqStructure!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  ctaPlacement?: string;

  @IsOptional()
  @IsObject()
  internalLinkingRules?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  formattingInstructions?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
