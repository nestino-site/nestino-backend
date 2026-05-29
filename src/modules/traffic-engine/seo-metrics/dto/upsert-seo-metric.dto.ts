import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpsertSeoMetricDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  siteId!: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageId?: number;

  @ApiProperty({ example: '2026-05-01', format: 'date' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ example: 'ivf cost spain' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ example: 1250 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  impressions?: number;

  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clicks?: number;

  @ApiPropertyOptional({ example: 0.0336, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  ctr?: number;

  @ApiPropertyOptional({ example: 8.4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  avgPosition?: number;

  @ApiPropertyOptional({ example: 0.05 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ctrExpected?: number;

  @ApiPropertyOptional({ example: -0.0164 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ctrGap?: number;

  @ApiPropertyOptional({ example: 380 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  organicSessions?: number;

  @ApiPropertyOptional({ example: 0.42 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bounceRate?: number;
}
