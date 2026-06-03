import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, Length, IsOptional } from 'class-validator';

export class CreateCountryDto {
  @ApiProperty({ example: 'ES' })
  @IsString()
  @Length(2, 2)
  declare codeIso2: string;

  @ApiProperty({ example: 'Spain' })
  @IsString()
  declare name: string;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  declare defaultCurrency?: string;
}

export class UpdateCountryDto extends PartialType(CreateCountryDto) {}
