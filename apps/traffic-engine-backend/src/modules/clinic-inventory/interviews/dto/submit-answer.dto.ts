import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class SubmitAnswerDto {
  @ApiProperty({ example: 'HC_01' })
  @IsString()
  declare questionCode: string;

  @ApiPropertyOptional({ description: 'For LIKERT/NUMBER questions', example: 4 })
  @IsOptional()
  @IsNumber()
  declare valueNum?: number;

  @ApiPropertyOptional({ description: 'For TEXT/CHOICE/YES_NO questions', example: 'Yes' })
  @IsOptional()
  @IsString()
  declare valueText?: string;
}
