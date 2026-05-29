import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class BulkGenerateDto {
  @ApiProperty({
    type: [Number],
    example: [101, 102, 103],
    description: 'Keyword IDs to generate pages for (1–500 items)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @Type(() => Number)
  @IsInt({ each: true })
  keywordIds!: number[];
}
