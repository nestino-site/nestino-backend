import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class BulkReviewDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  ideaIds!: number[];

  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
