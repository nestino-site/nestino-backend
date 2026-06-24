import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsInt, IsBoolean, IsNumber, IsArray, IsEmail, IsObject,
} from 'class-validator';

export class CreateClinicDto {
  @ApiProperty({ example: 'Institut Marquès Barcelona' })
  @IsString()
  declare name: string;

  @ApiPropertyOptional({ description: 'Auto-generated from name if omitted' })
  @IsOptional()
  @IsString()
  declare slug?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  declare cityId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  declare countryId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare addressLine?: string;

  @ApiPropertyOptional({ example: 41.3962 })
  @IsOptional()
  @IsNumber()
  declare lat?: number;

  @ApiPropertyOptional({ example: 2.1619 })
  @IsOptional()
  @IsNumber()
  declare lng?: number;

  @ApiPropertyOptional({ example: 'https://www.institutmarques.com' })
  @IsOptional()
  @IsString()
  declare websiteUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  declare email?: string;

  @ApiPropertyOptional({ type: [String], example: ['en', 'es', 'fr'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  declare languages?: string[];

  @ApiPropertyOptional({ example: 1997 })
  @IsOptional()
  @IsInt()
  declare foundedYear?: number;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  declare doctorsCount?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  declare inHouseLab?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare shortDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare longDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare heroImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare googlePlaceId?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  declare openingHours?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'https://maps.google.com/?cid=123' })
  @IsOptional()
  @IsString()
  declare googleMapsUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare editorialSummary?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  declare priceLevel?: number;

  @ApiPropertyOptional({ example: '+34 934 17 69 16' })
  @IsOptional()
  @IsString()
  declare formattedPhone?: string;

  @ApiPropertyOptional({ type: [String], example: ['health', 'doctor', 'establishment'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  declare placeTypes?: string[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  declare googlePhotos?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  declare googleReviews?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  declare sourcePayload?: Record<string, unknown>;
}

export class UpdateClinicDto extends PartialType(CreateClinicDto) {}
