import { Injectable, Logger } from '@nestjs/common';
import { AiImageProvider } from './providers/ai-image.provider';
import { GooglePlacesImageProvider } from './providers/google-places-image.provider';
import { PexelsProvider } from './providers/pexels.provider';
import { ImageProcessorService } from './image-processor.service';
import {
  FetchImageInput,
  ImageSource,
  ProcessedImageResult,
} from './types/image-management.types';

@Injectable()
export class ImageManagementService {
  private readonly logger = new Logger(ImageManagementService.name);

  constructor(
    private readonly pexels: PexelsProvider,
    private readonly googlePlaces: GooglePlacesImageProvider,
    private readonly aiImage: AiImageProvider,
    private readonly processor: ImageProcessorService,
  ) {}

  /**
   * Fetch, process, and save an image for the given subject.
   *
   * @param input - Subject, keywords, mode ('real' | 'ai'), and optional location data.
   * @returns Processed image metadata including filePath, seoFilename, altText, dimensions.
   */
  async fetchAndProcess(input: FetchImageInput): Promise<ProcessedImageResult> {
    const { subject, keywords, mode, locationData } = input;

    let rawBuffer: Buffer | null = null;
    let source: ImageSource = 'placeholder';

    if (mode === 'real') {
      if (locationData?.isSpecificPlace) {
        this.logger.log({ msg: 'image_source_attempt', source: 'google_places', subject });
        rawBuffer = await this.googlePlaces.fetchImageBuffer(subject, locationData);
        if (rawBuffer) {
          source = 'google_places';
        } else {
          this.logger.warn({ msg: 'google_places_fallback_to_pexels', subject });
        }
      }

      if (!rawBuffer) {
        this.logger.log({ msg: 'image_source_attempt', source: 'pexels', subject });
        rawBuffer = await this.pexels.fetchImageBuffer(subject, keywords);
        if (rawBuffer) {
          source = 'pexels';
        }
      }
    } else {
      const prompt = this.aiImage.buildPrompt(subject, keywords);
      this.logger.log({ msg: 'image_source_attempt', source: 'openai', subject });
      rawBuffer = await this.aiImage.generateImageBuffer(prompt);
      if (rawBuffer) {
        source = 'openai';
      }
    }

    if (!rawBuffer) {
      this.logger.warn({ msg: 'all_image_sources_failed_using_placeholder', subject });
      const placeholder = await this.processor.generatePlaceholder(subject, keywords);
      return { ...placeholder, source: 'placeholder' };
    }

    const processed = await this.processor.process(rawBuffer, subject, keywords);
    return { ...processed, source };
  }
}
