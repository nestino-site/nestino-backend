import { ContentLanguage, SiteStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateSiteDto {
  @IsString()
  name!: string;

  @IsString()
  domain!: string;

  @IsOptional()
  @IsEnum(ContentLanguage)
  defaultLanguage?: ContentLanguage;

  @IsOptional()
  @IsArray()
  @IsEnum(ContentLanguage, { each: true })
  languages?: ContentLanguage[];

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsEnum(SiteStatus)
  status?: SiteStatus;

  @IsOptional()
  @IsString()
  gscProperty?: string;

  @IsOptional()
  @IsString()
  ga4PropertyId?: string;

  @IsOptional()
  @IsUrl()
  publishWebhookUrl?: string;

  @IsOptional()
  @IsString()
  publishWebhookSecret?: string;

  @IsOptional()
  @IsBoolean()
  autoPublish?: boolean;
}
