import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, Max, Min } from 'class-validator';
import { PageKeywordRole } from '@prisma/client';

export class AssignPageKeywordDto {
  @ApiProperty({ example: 42 })
  @Type(() => Number)
  @IsInt()
  keywordId!: number;

  @ApiProperty({ enum: PageKeywordRole, example: PageKeywordRole.SECONDARY })
  @IsEnum(PageKeywordRole)
  role!: PageKeywordRole;

  @ApiProperty({ example: 0.5, minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  weight!: number;
}
