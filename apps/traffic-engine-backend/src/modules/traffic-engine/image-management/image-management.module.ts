import { Module } from '@nestjs/common';
import { ImageManagementController } from './controllers/image-management.controller';
import { ImageManagementService } from './image-management.service';
import { ImageProcessorService } from './image-processor.service';
import { AiImageProvider } from './providers/ai-image.provider';
import { GooglePlacesImageProvider } from './providers/google-places-image.provider';
import { PexelsProvider } from './providers/pexels.provider';

@Module({
  controllers: [ImageManagementController],
  providers: [
    ImageManagementService,
    ImageProcessorService,
    PexelsProvider,
    GooglePlacesImageProvider,
    AiImageProvider,
  ],
  exports: [ImageManagementService, ImageProcessorService],
})
export class ImageManagementModule {}
