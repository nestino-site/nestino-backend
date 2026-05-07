import { AiProvider } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AiPipelineStepDto {
  @IsString()
  stepKey!: string;

  @IsEnum(AiProvider)
  provider!: AiProvider;

  @IsString()
  model!: string;

  @IsString()
  promptTemplateId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxOutputTokens?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  timeoutMs?: number;
}

export class PatchAiPipelineDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsArray()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => AiPipelineStepDto)
  steps!: AiPipelineStepDto[];
}
