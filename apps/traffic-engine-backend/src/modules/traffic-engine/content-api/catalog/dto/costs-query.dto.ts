import { IsOptional, IsString } from 'class-validator';

export class CostsQueryDto {
  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;
}
