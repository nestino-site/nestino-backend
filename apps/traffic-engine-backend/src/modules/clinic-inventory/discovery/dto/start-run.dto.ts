import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscoveryTrigger } from '@prisma/client';
import {
  IsBoolean, IsEnum, IsInt, IsObject, IsOptional,
} from 'class-validator';

export class StartRunDto {
  @ApiProperty({ example: 1, description: 'City id to run discovery for' })
  @IsInt()
  declare cityId: number;

  @ApiPropertyOptional({ enum: DiscoveryTrigger, example: DiscoveryTrigger.ADMIN })
  @IsOptional()
  @IsEnum(DiscoveryTrigger)
  declare triggeredBy?: DiscoveryTrigger;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  declare dryRun?: boolean;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: {
      pipeline: {
        dryRun: true,
        steps: [
          {
            stepKey: 'places_search',
            enabled: true,
            params: { keywords: ['fertility clinic', 'IVF clinic'], radiusKm: 25 },
          },
        ],
      },
    },
  })
  @IsOptional()
  @IsObject()
  declare configOverride?: Record<string, unknown>;
}
