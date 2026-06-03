import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray, IsBoolean, IsInt, IsNumber, IsObject, IsOptional, IsString, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PipelineConfig, PipelineStep } from '../discovery-pipeline.types';

export class PipelineStepDto implements PipelineStep {
  @ApiProperty({ example: 'places_search' })
  @IsString()
  declare stepKey: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  declare enabled: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { keywords: ['fertility clinic', 'IVF clinic'], radiusKm: 25, maxResults: 60 },
  })
  @IsObject()
  declare params: Record<string, unknown>;
}

export class PipelineConfigDto implements PipelineConfig {
  @ApiProperty({ example: 1 })
  @IsInt()
  declare version: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  declare dryRun?: boolean;

  @ApiProperty({ type: [PipelineStepDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PipelineStepDto)
  declare steps: PipelineStepDto[];
}

export class BudgetConfigDto {
  @ApiProperty({ example: 25 })
  @IsNumber()
  declare perRunUsd: number;

  @ApiProperty({ example: 500 })
  @IsNumber()
  declare monthlyUsd: number;

  @ApiProperty({ example: 80 })
  @IsNumber()
  declare alertOnPercent: number;
}

export class RateLimitConfigDto {
  @ApiProperty({ example: 5 })
  @IsNumber()
  declare placesQps: number;

  @ApiProperty({ example: 2 })
  @IsNumber()
  declare llmConcurrency: number;

  @ApiProperty({ example: 4 })
  @IsNumber()
  declare enrichmentConcurrency: number;
}

export class ScheduleConfigDto {
  @ApiProperty({ example: '0 3 * * 1' })
  @IsString()
  declare cron: string;

  @ApiProperty({ example: 'Europe/Madrid' })
  @IsString()
  declare timezone: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  declare isActive: boolean;
}

export class SetCityDiscoveryConfigDto {
  @ApiProperty({ type: PipelineConfigDto })
  @ValidateNested()
  @Type(() => PipelineConfigDto)
  declare pipeline: PipelineConfigDto;

  @ApiPropertyOptional({ type: BudgetConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BudgetConfigDto)
  declare budgets?: BudgetConfigDto;

  @ApiPropertyOptional({ type: RateLimitConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RateLimitConfigDto)
  declare rateLimits?: RateLimitConfigDto;

  @ApiPropertyOptional({ type: ScheduleConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleConfigDto)
  declare schedule?: ScheduleConfigDto;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  declare isActive?: boolean;
}

export class PatchSystemConfigDto extends PartialType(SetCityDiscoveryConfigDto) {}

export class PatchPipelineStepDto extends PartialType(PipelineStepDto) {}
