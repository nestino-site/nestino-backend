import { TaskType } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional } from 'class-validator';

export class CreateContentTaskDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  siteId?: number;

  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  keywordId?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageId?: number;

  @ApiPropertyOptional({ enum: TaskType, example: TaskType.GENERATE_CONTENT })
  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @ApiPropertyOptional({
    example: { skipYmylAudit: true },
    description: 'Optional pipeline overrides passed to the worker',
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
