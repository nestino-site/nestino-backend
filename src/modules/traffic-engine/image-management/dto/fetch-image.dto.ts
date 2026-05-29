import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ImageMode } from '../types/image-management.types';

class LocationDataDto {
  @ApiProperty({ example: 41.3851 })
  @IsNumber()
  lat!: number;

  @ApiProperty({ example: 2.1734 })
  @IsNumber()
  lng!: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  isSpecificPlace!: boolean;
}

export class FetchImageDto {
  @ApiProperty({ example: 'IVF clinic in Barcelona' })
  @IsString()
  subject!: string;

  @ApiProperty({ type: [String], example: ['ivf', 'barcelona', 'clinic'] })
  @IsArray()
  @IsString({ each: true })
  keywords!: string[];

  @ApiProperty({ enum: ['real', 'ai'], example: 'ai' })
  @IsEnum(['real', 'ai'])
  mode!: ImageMode;

  @ApiPropertyOptional({ type: LocationDataDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDataDto)
  locationData?: LocationDataDto;
}
