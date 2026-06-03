import { IsOptional, IsString } from 'class-validator';

export class SeoStrategyQueryDto {
  @IsString()
  siteId!: string;

  @IsOptional()
  @IsString()
  days?: string;
}
