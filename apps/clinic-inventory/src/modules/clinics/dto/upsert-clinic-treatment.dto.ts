import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpsertClinicTreatmentDto {
  @ApiProperty({ example: 'IVF' })
  @IsString()
  declare treatmentCode: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  declare isOffered?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare notes?: string;

  @ApiPropertyOptional({ example: { min: 45, max: 55, unit: 'percent' } })
  @IsOptional()
  declare successRateRange?: Record<string, unknown>;
}
