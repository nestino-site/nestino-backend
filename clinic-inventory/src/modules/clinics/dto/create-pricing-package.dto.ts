import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsBoolean, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePricingPackageDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  declare treatmentId?: number;

  @ApiProperty({ example: 'IVF Standard Package' })
  @IsString()
  declare packageName: string;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  declare currency?: string;

  @ApiPropertyOptional({ example: 6500 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  declare basePrice?: number;

  @ApiPropertyOptional({ example: 5500 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  declare priceMin?: number;

  @ApiPropertyOptional({ example: 8500 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  declare priceMax?: number;

  @ApiPropertyOptional({
    description: 'What is included in this package',
    example: ['Egg retrieval', 'Fertilisation', 'Embryo transfer', '1 monitoring scan'],
  })
  @IsOptional()
  @IsArray()
  declare includes?: string[];

  @ApiPropertyOptional({
    description: 'Common add-ons NOT included (the hidden costs section)',
    example: ['ICSI (+€800)', 'Blast culture day 5 (+€500)', 'Vitrification (+€600)', 'Anesthesia (+€350)'],
  })
  @IsOptional()
  @IsArray()
  declare excludes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare sourceUrl?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  declare isActive?: boolean;
}

export class UpdatePricingPackageDto extends PartialType(CreatePricingPackageDto) {}
