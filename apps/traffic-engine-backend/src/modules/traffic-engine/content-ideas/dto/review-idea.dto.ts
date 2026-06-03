import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReviewIdeaDto {
  @ApiPropertyOptional({ example: 'Approved — strong commercial angle for Spain hub.' })
  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
