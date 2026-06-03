import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class QuickDiscoveryDto {
  @ApiProperty({ example: 1, description: 'Existing city id to discover clinics in' })
  @IsInt()
  declare cityId: number;

  @ApiProperty({ type: [String], example: ['IVF'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  declare clinicTypes: string[];

  @ApiProperty({ example: 5, minimum: 1, maximum: 60 })
  @IsInt()
  @Min(1)
  @Max(60)
  declare maxResults: number;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  declare autoApprove?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  declare dryRun?: boolean;
}
