import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdatePageSlugDto {
  @ApiProperty({
    description: 'New URL path for the page',
    example: '/guides/ivf-in-spain',
  })
  @IsString()
  @IsNotEmpty()
  slug!: string;

  @ApiPropertyOptional({
    description:
      'When true (default on PUBLISHED pages), notify the frontend via page.updated webhook',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  republish?: boolean;
}
