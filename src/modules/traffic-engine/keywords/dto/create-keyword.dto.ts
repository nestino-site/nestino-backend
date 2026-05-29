import { ContentLanguage, KeywordIntent, KeywordStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateKeywordDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  siteId!: number;

  @ApiProperty({ example: 'ivf cost spain' })
  @IsString()
  keyword!: string;

  @ApiPropertyOptional({ enum: ContentLanguage, example: ContentLanguage.EN })
  @IsOptional()
  @IsEnum(ContentLanguage)
  language?: ContentLanguage;

  @ApiPropertyOptional({ example: 10, description: 'Parent keyword ID for cluster grouping' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  baseKeywordId?: number;

  @ApiPropertyOptional({ enum: KeywordIntent, example: KeywordIntent.COMMERCIAL })
  @IsOptional()
  @IsEnum(KeywordIntent)
  intent?: KeywordIntent;

  @ApiPropertyOptional({ enum: KeywordStatus, example: KeywordStatus.PENDING })
  @IsOptional()
  @IsEnum(KeywordStatus)
  status?: KeywordStatus;

  @ApiPropertyOptional({ example: 2400 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  searchVolume?: number;

  @ApiPropertyOptional({ example: 45, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  difficulty?: number;

  @ApiPropertyOptional({ example: 2.35 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cpc?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ example: '/guides/ivf-in-spain' })
  @IsOptional()
  @IsString()
  targetUrl?: string;

  @ApiPropertyOptional({ example: 'Primary commercial keyword for Spain hub' })
  @IsOptional()
  @IsString()
  notes?: string;
}
