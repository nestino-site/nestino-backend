import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class ClinicWebhookPayloadDto {
  @ApiProperty({ enum: ['CLINIC_PUBLISHED', 'CLINIC_UPDATED', 'TRUTH_SCORE_CHANGED'], example: 'CLINIC_PUBLISHED' })
  @IsIn(['CLINIC_PUBLISHED', 'CLINIC_UPDATED', 'TRUTH_SCORE_CHANGED'])
  event!: 'CLINIC_PUBLISHED' | 'CLINIC_UPDATED' | 'TRUTH_SCORE_CHANGED';

  @ApiProperty({ example: 42 })
  @IsNumber()
  clinicId!: number;

  @ApiProperty({ example: 'barcelona-fertility-center' })
  @IsString()
  slug!: string;

  @ApiProperty({ example: 'Barcelona Fertility Center' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'barcelona' })
  @IsOptional()
  @IsString()
  citySlug?: string;

  @ApiPropertyOptional({ example: 'ES' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ example: 'spain' })
  @IsOptional()
  @IsString()
  countrySlug?: string;

  @ApiPropertyOptional({ example: 'Carrer de les Escoles Pies, 103, Barcelona, Spain' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '+34 934 17 69 16' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'https://barcelonaivf.com' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 4.5 })
  @IsOptional()
  @IsNumber()
  googleRating?: number;

  @ApiPropertyOptional({ example: 546 })
  @IsOptional()
  @IsNumber()
  googleReviewCount?: number;

  @ApiPropertyOptional({ example: 'https://maps.google.com/?cid=123' })
  @IsOptional()
  @IsString()
  googleMapsUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  editorialSummary?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  openingHours?: unknown;

  @ApiPropertyOptional({ type: [String], example: ['IVF'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  treatments?: string[];

  @ApiProperty({ example: 'PUBLISHED' })
  @IsString()
  status!: string;

  @ApiPropertyOptional({ example: '2026-05-01T12:00:00.000Z' })
  @IsOptional()
  @IsString()
  publishedAt?: string;

  @ApiPropertyOptional({ example: 82.5 })
  @IsOptional()
  @IsNumber()
  composite?: number;

  @ApiPropertyOptional({ example: 'A' })
  @IsOptional()
  @IsString()
  grade?: string;
}
