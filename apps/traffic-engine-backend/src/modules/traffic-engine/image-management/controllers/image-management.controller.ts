import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FetchImageDto } from '../dto/fetch-image.dto';
import { ImageManagementService } from '../image-management.service';

@ApiTags('Images')
@ApiBearerAuth('bearer')
@Controller('images')
export class ImageManagementController {
  constructor(private readonly imageManagementService: ImageManagementService) {}

  /**
   * Fetch or generate an image for a subject/topic,
   * process it to WebP, and return SEO-ready metadata.
   */
  @Post('fetch')
  @ApiOperation({ summary: 'Fetch or generate a hero image (real or AI)' })
  @ApiResponse({ status: 201, description: 'Image metadata and CDN URL' })
  async fetchImage(@Body() dto: FetchImageDto) {
    return this.imageManagementService.fetchAndProcess(dto);
  }
}
