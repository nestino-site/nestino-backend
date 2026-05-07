import { IsArray, IsString, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class BulkGenerateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  keywordIds!: string[];
}
