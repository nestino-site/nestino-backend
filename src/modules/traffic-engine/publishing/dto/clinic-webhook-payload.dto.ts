import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ClinicWebhookPayloadDto {
  @ApiProperty({ enum: ['CLINIC_PUBLISHED', 'CLINIC_UPDATED', 'TRUTH_SCORE_CHANGED'], example: 'CLINIC_PUBLISHED' })
  event!: 'CLINIC_PUBLISHED' | 'CLINIC_UPDATED' | 'TRUTH_SCORE_CHANGED';

  @ApiProperty({ example: 42 })
  clinicId!: number;

  @ApiProperty({ example: 'barcelona-fertility-center' })
  slug!: string;

  @ApiProperty({ example: 'Barcelona Fertility Center' })
  name!: string;

  @ApiPropertyOptional({ example: 'barcelona' })
  citySlug?: string;

  @ApiPropertyOptional({ example: 'ES' })
  countryCode?: string;

  @ApiProperty({ example: 'PUBLISHED' })
  status!: string;

  @ApiPropertyOptional({ example: '2026-05-01T12:00:00.000Z' })
  publishedAt?: string;

  @ApiPropertyOptional({ example: 82.5 })
  composite?: number;

  @ApiPropertyOptional({ example: 'A' })
  grade?: string;
}
