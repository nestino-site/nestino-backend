import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, IsOptional, IsBoolean } from 'class-validator';

export class StartInterviewDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  declare clinicId: number;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  declare language?: string;

  @ApiPropertyOptional({ example: '35-39' })
  @IsOptional()
  @IsString()
  declare ageBucket?: string;

  @ApiPropertyOptional({ example: 'US' })
  @IsOptional()
  @IsString()
  declare originCountry?: string;

  @ApiPropertyOptional({ example: 'IVF' })
  @IsOptional()
  @IsString()
  declare treatmentCode?: string;

  @ApiPropertyOptional({ example: 2025 })
  @IsOptional()
  @IsInt()
  declare completedYear?: number;

  @ApiProperty({ description: 'Patient explicitly consented to recording and publishing' })
  @IsBoolean()
  declare consentGiven: boolean;
}
