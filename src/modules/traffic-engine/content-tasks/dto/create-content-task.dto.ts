import { TaskType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional } from 'class-validator';

export class CreateContentTaskDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  siteId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  keywordId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageId?: number;

  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
