import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsBoolean } from 'class-validator';

export class CreateTreatmentDto {
  @ApiProperty({ example: 'IVF' })
  @IsString()
  declare code: string;

  @ApiProperty({ example: 'IVF — In Vitro Fertilisation' })
  @IsString()
  declare name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare description?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  declare sortOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  declare isActive?: boolean;
}

export class UpdateTreatmentDto extends PartialType(CreateTreatmentDto) {}
