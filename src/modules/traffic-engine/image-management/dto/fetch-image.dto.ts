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
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsBoolean()
  isSpecificPlace!: boolean;
}

export class FetchImageDto {
  @IsString()
  subject!: string;

  @IsArray()
  @IsString({ each: true })
  keywords!: string[];

  @IsEnum(['real', 'ai'])
  mode!: ImageMode;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDataDto)
  locationData?: LocationDataDto;
}
