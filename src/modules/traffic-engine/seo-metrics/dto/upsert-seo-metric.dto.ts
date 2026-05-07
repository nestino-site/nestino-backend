import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpsertSeoMetricDto {
  @IsString()
  siteId!: string;

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  impressions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clicks?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  ctr?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  avgPosition?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ctrExpected?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ctrGap?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  organicSessions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bounceRate?: number;
}
