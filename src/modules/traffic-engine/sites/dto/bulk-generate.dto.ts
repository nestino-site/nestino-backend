import { Type } from 'class-transformer';
import { IsArray, IsInt, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class BulkGenerateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @Type(() => Number)
  @IsInt({ each: true })
  keywordIds!: number[];
}
