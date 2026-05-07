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
  @IsBoolean()
  strictMode!: boolean;

  @IsBoolean()
  skipAnalysis!: boolean;

  @IsBoolean()
  skipRewrite!: boolean;
}

class PipelineConfigDto {
  @IsArray()
  @IsIn(['generate', 'analyze', 'rewrite', 'image_generation', 'seo_check'], {
    each: true,
  })
  steps!: Array<
    'generate' | 'analyze' | 'rewrite' | 'image_generation' | 'seo_check'
  >;

  @ValidateNested()
  @Type(() => PipelineOptionsDto)
  options!: PipelineOptionsDto;
}

class ModelRulesDto {
  @IsString()
  highPriority!: string;

  @IsString()
  lowPriority!: string;

  @IsString()
  fallback!: string;
}

class ModelConfigDto {
  @IsString()
  generate!: string;

  @IsString()
  analyze!: string;

  @IsString()
  rewrite!: string;

  @IsString()
  image_generation!: string;

  @IsString()
  seo_check!: string;

  @ValidateNested()
  @Type(() => ModelRulesDto)
  rules!: ModelRulesDto;
}

class HumanizationDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(['low', 'medium', 'high'])
  level!: 'low' | 'medium' | 'high';
}

class PromptConfigDto {
  @IsString()
  generateVersion!: string;

  @IsString()
  analyzeVersion!: string;

  @IsString()
  rewriteVersion!: string;

  @IsString()
  imageGenerationVersion!: string;

  @IsString()
  seoCheckVersion!: string;

  @IsIn(['seo', 'conversational', 'formal'])
  tone!: 'seo' | 'conversational' | 'formal';

  @IsBoolean()
  localeSupport!: boolean;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsBoolean()
  abTestingEnabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => HumanizationDto)
  humanization?: HumanizationDto;
}

class RuntimeConfigDto {
  @IsBoolean()
  enableAnalysis!: boolean;

  @IsBoolean()
  enableRewrite!: boolean;

  @IsBoolean()
  enableImageGeneration!: boolean;

  @IsBoolean()
  enableSeoCheck!: boolean;

  @IsNumber()
  @Min(0)
  @Max(5)
  maxRetries!: number;
}

export class UpsertSiteConfigDto {
  @IsString()
  siteId!: string;

  @IsNumber()
  @Min(0)
  aiBudgetLimit!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  qualityThreshold!: number;

  @ValidateNested()
  @Type(() => PipelineConfigDto)
  pipelineConfig!: PipelineConfigDto;

  @ValidateNested()
  @Type(() => ModelConfigDto)
  modelConfig!: ModelConfigDto;

  @ValidateNested()
  @Type(() => PromptConfigDto)
  promptConfig!: PromptConfigDto;

  @ValidateNested()
  @Type(() => RuntimeConfigDto)
  runtimeConfig!: RuntimeConfigDto;
}

export class UpdateSiteConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  aiBudgetLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  qualityThreshold?: number;

  @IsOptional()
  @IsObject()
  pipelineConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  modelConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  promptConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  runtimeConfig?: Record<string, unknown>;
}
