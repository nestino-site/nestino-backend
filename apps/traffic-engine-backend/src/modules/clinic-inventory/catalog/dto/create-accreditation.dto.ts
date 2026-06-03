import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, Length } from 'class-validator';

export class CreateAccreditationDto {
  @ApiProperty({ example: 'ESHRE' })
  @IsString()
  declare code: string;

  @ApiProperty({ example: 'ESHRE Member' })
  @IsString()
  declare name: string;

  @ApiPropertyOptional({ example: 'European Society of Human Reproduction and Embryology' })
  @IsOptional()
  @IsString()
  declare regulator?: string;

  @ApiPropertyOptional({ example: 'ES' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  declare countryCode?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  declare isActive?: boolean;
}

export class UpdateAccreditationDto extends PartialType(CreateAccreditationDto) {}
