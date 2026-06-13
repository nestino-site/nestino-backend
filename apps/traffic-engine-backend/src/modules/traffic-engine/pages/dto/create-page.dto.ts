import { ContentLanguage, PageStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class CreatePageDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  siteId!: number;

  @ApiProperty({ example: 42 })
  @Type(() => Number)
  @IsInt()
  keywordId!: number;

  @ApiProperty({ example: '/guides/ivf-in-spain' })
  @IsString()
  slug!: string;

  @ApiPropertyOptional({ enum: ContentLanguage, example: ContentLanguage.EN })
  @IsOptional()
  @IsEnum(ContentLanguage)
  language?: ContentLanguage;

  @ApiPropertyOptional({ example: 'IVF in Spain: Complete Guide' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'IVF in Spain — Costs, Clinics & Success Rates' })
  @IsOptional()
  @IsString()
  metaTitle?: string;

  @ApiPropertyOptional({ example: 'Compare IVF costs and clinic options in Spain.' })
  @IsOptional()
  @IsString()
  metaDescription?: string;

  @ApiPropertyOptional({ example: '# IVF in Spain\n\nContent markdown...' })
  @IsOptional()
  @IsString()
  finalContent?: string;

  @ApiPropertyOptional({ enum: PageStatus, example: PageStatus.DRAFT })
  @IsOptional()
  @IsEnum(PageStatus)
  status?: PageStatus;

  @ApiPropertyOptional({ example: 'index, follow' })
  @IsOptional()
  @IsString()
  robotsMeta?: string;
}
