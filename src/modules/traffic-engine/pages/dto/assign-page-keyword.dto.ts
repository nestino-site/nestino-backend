import { IsEnum, IsNumber, IsString, Max, Min } from 'class-validator';
import { PageKeywordRole } from '@prisma/client';

export class AssignPageKeywordDto {
  @IsString()
  keywordId!: string;

  @IsEnum(PageKeywordRole)
  role!: PageKeywordRole;

  @IsNumber()
  @Min(0)
  @Max(1)
  weight!: number;
}
