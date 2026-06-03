import { AiProvider } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ example: 'generate' })
  @IsString()
  stepKey!: string;

  @ApiProperty({ enum: AiProvider, example: AiProvider.google })
  @IsEnum(AiProvider)
  provider!: AiProvider;

  @ApiProperty({ example: 'gemini-2.0-flash' })
  @IsString()
  model!: string;

  @ApiProperty({ example: 'generate-v3' })
  @IsString()
  promptTemplateId!: string;

  @ApiPropertyOptional({ example: 0.7, minimum: 0, maximum: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ example: 8192, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxOutputTokens?: number;

  @ApiPropertyOptional({ example: 120000, minimum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  timeoutMs?: number;
}

export class PatchAiPipelineDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ type: [AiPipelineStepDto] })
  @IsArray()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => AiPipelineStepDto)
  steps!: AiPipelineStepDto[];
}
