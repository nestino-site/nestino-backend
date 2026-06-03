import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsBoolean, IsEnum, IsInt, IsArray,
} from 'class-validator';
import { MediaKind } from '@prisma/client';

export class AddMediaDto {
  @ApiProperty({ enum: MediaKind, example: 'PHOTO' })
  @IsEnum(MediaKind)
  declare kind: MediaKind;

  @ApiProperty({ example: 'https://cdn.example.com/image.jpg' })
  @IsString()
  declare url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare caption?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  declare displayOrder?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  declare isPrimary?: boolean;
}

export class UpdateMediaDto extends PartialType(AddMediaDto) {}

export class ReorderMediaDto {
  @ApiProperty({
    type: [Number],
    example: [12, 10, 14],
    description: 'Media ids in the new display order',
  })
  @IsArray()
  @IsInt({ each: true })
  declare orderedIds: number[];
}
