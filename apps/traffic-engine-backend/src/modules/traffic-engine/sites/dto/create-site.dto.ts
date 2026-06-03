import { ContentLanguage, SiteStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateSiteDto {
  @ApiProperty({ example: 'MedCover' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'medcover.com' })
  @IsString()
  domain!: string;

  @ApiPropertyOptional({ enum: ContentLanguage, example: ContentLanguage.EN })
  @IsOptional()
  @IsEnum(ContentLanguage)
  defaultLanguage?: ContentLanguage;

  @ApiPropertyOptional({ enum: ContentLanguage, isArray: true, example: [ContentLanguage.EN] })
  @IsOptional()
  @IsArray()
  @IsEnum(ContentLanguage, { each: true })
  languages?: ContentLanguage[];

  @ApiPropertyOptional({ example: 'Europe/Paris' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ enum: SiteStatus, example: SiteStatus.ACTIVE })
  @IsOptional()
  @IsEnum(SiteStatus)
  status?: SiteStatus;

  @ApiPropertyOptional({ example: 'https://medcover.com' })
  @IsOptional()
  @IsString()
  gscProperty?: string;

  @ApiPropertyOptional({ example: '123456789' })
  @IsOptional()
  @IsString()
  ga4PropertyId?: string;

  @ApiPropertyOptional({ example: 'https://frontend.example.com/api/webhooks/publish' })
  @IsOptional()
  @IsUrl()
  publishWebhookUrl?: string;

  @ApiPropertyOptional({ example: 'whsec_xxx' })
  @IsOptional()
  @IsString()
  publishWebhookSecret?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  autoPublish?: boolean;
}
