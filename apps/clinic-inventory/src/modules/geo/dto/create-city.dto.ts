import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, IsBoolean, IsNumber, IsEnum } from 'class-validator';
import { DestinationPhase } from '@prisma/client';

export class CreateCityDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  declare countryId: number;

  @ApiProperty({ example: 'Barcelona' })
  @IsString()
  declare name: string;

  @ApiProperty({ example: 'barcelona' })
  @IsString()
  declare slug: string;

  @ApiPropertyOptional({ example: 41.3851 })
  @IsOptional()
  @IsNumber()
  declare lat?: number;

  @ApiPropertyOptional({ example: 2.1734 })
  @IsOptional()
  @IsNumber()
  declare lng?: number;

  @ApiPropertyOptional({ enum: DestinationPhase })
  @IsOptional()
  @IsEnum(DestinationPhase)
  declare phase?: DestinationPhase;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  declare isActiveDestination?: boolean;
}

export class UpdateCityDto extends PartialType(CreateCityDto) {}
