import { IsIn, IsOptional, IsString } from 'class-validator';

export class CompareQueryDto {
  @IsIn(['clinic', 'city', 'country'])
  type!: 'clinic' | 'city' | 'country';

  @IsString()
  a!: string;

  @IsString()
  b!: string;

  @IsOptional()
  @IsString()
  treatment?: string;
}
