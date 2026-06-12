import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ListPagesQueryDto {
  @ApiPropertyOptional({ example: 'guide' })
  @IsOptional()
  @IsString()
  pageType?: string;

  @ApiPropertyOptional({ example: 'spain' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'barcelona' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'ivf' })
  @IsOptional()
  @IsString()
  treatment?: string;
}
