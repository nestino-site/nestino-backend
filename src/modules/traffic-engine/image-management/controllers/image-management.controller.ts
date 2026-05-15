import { Body, Controller, Post } from '@nestjs/common';
import { FetchImageDto } from '../dto/fetch-image.dto';
import { ImageManagementService } from '../image-management.service';

@Controller('images')
export class ImageManagementController {
  constructor(private readonly imageManagementService: ImageManagementService) {}

  /**
   * Fetch or generate an image for a subject/topic,
   * process it to WebP, and return SEO-ready metadata.
   *
   * POST /api/v1/images/fetch
   */
  @Post('fetch')
  async fetchImage(@Body() dto: FetchImageDto) {
    return this.imageManagementService.fetchAndProcess(dto);
  }
}
