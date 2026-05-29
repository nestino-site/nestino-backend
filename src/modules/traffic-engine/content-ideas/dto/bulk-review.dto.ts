import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class BulkReviewDto {
  @ApiProperty({ type: [Number], example: [1, 2, 3] })
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  ideaIds!: number[];

  @ApiPropertyOptional({ example: 'Batch approved during editorial review.' })
  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
