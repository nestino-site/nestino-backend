import { IsOptional, IsString } from 'class-validator';

export class ReviewIdeaDto {
  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
