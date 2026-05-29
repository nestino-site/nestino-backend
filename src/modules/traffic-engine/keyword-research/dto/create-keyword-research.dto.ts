import { ContentLanguage, KeywordResearchSource } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsString } from 'class-validator';

export class CreateKeywordResearchDto {
  @ApiProperty({ example: 'ivf spain' })
  @IsString()
  seedKeyword!: string;

  @ApiProperty({ enum: ContentLanguage, example: ContentLanguage.EN })
  @IsEnum(ContentLanguage)
  language!: ContentLanguage;

  @ApiProperty({
    type: [String],
    example: ['ivf cost spain', 'best ivf clinics spain', 'ivf success rate spain'],
  })
  @IsArray()
  @IsString({ each: true })
  suggestions!: string[];

  @ApiProperty({ enum: KeywordResearchSource, example: KeywordResearchSource.MANUAL })
  @IsEnum(KeywordResearchSource)
  source!: KeywordResearchSource;
}
