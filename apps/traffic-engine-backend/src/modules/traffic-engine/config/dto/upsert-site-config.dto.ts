import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class PipelineOptionsDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  strictMode!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  skipAnalysis!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  skipRewrite!: boolean;
}

class PipelineConfigDto {
  @ApiProperty({
    type: [String],
    example: ['generate', 'analyze', 'rewrite', 'image_generation', 'seo_check'],
  })
  @IsArray()
  @IsIn(['generate', 'analyze', 'rewrite', 'image_generation', 'seo_check'], {
    each: true,
  })
  steps!: Array<
    'generate' | 'analyze' | 'rewrite' | 'image_generation' | 'seo_check'
  >;

  @ApiProperty({ type: PipelineOptionsDto })
  @ValidateNested()
  @Type(() => PipelineOptionsDto)
  options!: PipelineOptionsDto;
}

class ModelRulesDto {
  @ApiProperty({ example: 'gemini-2.0-flash' })
  @IsString()
  highPriority!: string;

  @ApiProperty({ example: 'gemini-2.0-flash-lite' })
  @IsString()
  lowPriority!: string;

  @ApiProperty({ example: 'gemini-1.5-flash' })
  @IsString()
  fallback!: string;
}

class ModelConfigDto {
  @ApiProperty({ example: 'gemini-2.0-flash' })
  @IsString()
  generate!: string;

  @ApiProperty({ example: 'gemini-2.0-flash' })
  @IsString()
  analyze!: string;

  @ApiProperty({ example: 'gemini-2.0-flash' })
  @IsString()
  rewrite!: string;

  @ApiProperty({ example: 'imagen-3.0-generate-002' })
  @IsString()
  image_generation!: string;

  @ApiProperty({ example: 'gemini-2.0-flash' })
  @IsString()
  seo_check!: string;

  @ApiProperty({ type: ModelRulesDto })
  @ValidateNested()
  @Type(() => ModelRulesDto)
  rules!: ModelRulesDto;
}

class HumanizationDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ enum: ['low', 'medium', 'high'], example: 'medium' })
  @IsIn(['low', 'medium', 'high'])
  level!: 'low' | 'medium' | 'high';
}

class PromptConfigDto {
  @ApiProperty({ example: 'v3' })
  @IsString()
  generateVersion!: string;

  @ApiProperty({ example: 'v2' })
  @IsString()
  analyzeVersion!: string;

  @ApiProperty({ example: 'v2' })
  @IsString()
  rewriteVersion!: string;

  @ApiProperty({ example: 'v1' })
  @IsString()
  imageGenerationVersion!: string;

  @ApiProperty({ example: 'v1' })
  @IsString()
  seoCheckVersion!: string;

  @ApiProperty({ enum: ['seo', 'conversational', 'formal'], example: 'seo' })
  @IsIn(['seo', 'conversational', 'formal'])
  tone!: 'seo' | 'conversational' | 'formal';

  @ApiProperty({ example: true })
  @IsBoolean()
  localeSupport!: boolean;

  @ApiPropertyOptional({ example: 'en-US' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  abTestingEnabled?: boolean;

  @ApiPropertyOptional({ type: HumanizationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HumanizationDto)
  humanization?: HumanizationDto;
}

class RuntimeConfigDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enableAnalysis!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  enableRewrite!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  enableImageGeneration!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  enableSeoCheck!: boolean;

  @ApiProperty({ example: 2, minimum: 0, maximum: 5 })
  @IsNumber()
  @Min(0)
  @Max(5)
  maxRetries!: number;
}

export class UpsertSiteConfigDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsNumber()
  siteId!: number;

  @ApiProperty({ example: 500, minimum: 0 })
  @IsNumber()
  @Min(0)
  aiBudgetLimit!: number;

  @ApiProperty({ example: 75, minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  qualityThreshold!: number;

  @ApiProperty({ type: PipelineConfigDto })
  @ValidateNested()
  @Type(() => PipelineConfigDto)
  pipelineConfig!: PipelineConfigDto;

  @ApiProperty({ type: ModelConfigDto })
  @ValidateNested()
  @Type(() => ModelConfigDto)
  modelConfig!: ModelConfigDto;

  @ApiProperty({ type: PromptConfigDto })
  @ValidateNested()
  @Type(() => PromptConfigDto)
  promptConfig!: PromptConfigDto;

  @ApiProperty({ type: RuntimeConfigDto })
  @ValidateNested()
  @Type(() => RuntimeConfigDto)
  runtimeConfig!: RuntimeConfigDto;
}

export class UpdateSiteConfigDto {
  @ApiPropertyOptional({ example: 750, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  aiBudgetLimit?: number;

  @ApiPropertyOptional({ example: 80, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  qualityThreshold?: number;

  @ApiPropertyOptional({ example: { steps: ['generate', 'seo_check'], options: { strictMode: true } } })
  @IsOptional()
  @IsObject()
  pipelineConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { generate: 'gemini-2.0-flash' } })
  @IsOptional()
  @IsObject()
  modelConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { tone: 'conversational' } })
  @IsOptional()
  @IsObject()
  promptConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { maxRetries: 3 } })
  @IsOptional()
  @IsObject()
  runtimeConfig?: Record<string, unknown>;
}
