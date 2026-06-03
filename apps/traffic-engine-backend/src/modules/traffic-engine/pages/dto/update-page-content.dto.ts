import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdatePageContentDto {
  @ApiProperty({
    description: 'Full page body in Markdown (replaces finalContent and rawDraft)',
    example: '# IVF in Barcelona\n\nUpdated paragraph with corrected costs...',
  })
  @IsString()
  @IsNotEmpty()
  finalContent!: string;

  @ApiPropertyOptional({
    description:
      'When true and the page is already PUBLISHED, re-render HTML and notify the frontend (page.updated webhook)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  republish?: boolean;
}
