import { AiProvider } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class GenerateIdeasDto {
  @ApiProperty({ example: 10, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  count!: number;

  @ApiPropertyOptional({ enum: AiProvider, example: AiProvider.google })
  @IsOptional()
  @IsEnum(AiProvider)
  provider?: AiProvider;
}
