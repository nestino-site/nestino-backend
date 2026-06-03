import { TaskType } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class CreateIdeaTaskDto {
  @ApiPropertyOptional({ enum: TaskType, example: TaskType.GENERATE_CONTENT })
  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;
}
