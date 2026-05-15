import { IsArray, IsOptional, IsString } from 'class-validator';

export class BulkReviewDto {
  @IsArray()
  @IsString({ each: true })
  ideaIds!: string[];

  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
