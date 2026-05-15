import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, Max, Min } from 'class-validator';
import { PageKeywordRole } from '@prisma/client';

export class AssignPageKeywordDto {
  @Type(() => Number)
  @IsInt()
  keywordId!: number;

  @IsEnum(PageKeywordRole)
  role!: PageKeywordRole;

  @IsNumber()
  @Min(0)
  @Max(1)
  weight!: number;
}
