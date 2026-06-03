import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

interface PexelsPhoto {
  src: {
    large2x: string;
    large: string;
    medium: string;
  };
  alt: string;
}

interface PexelsSearchResponse {
  photos: PexelsPhoto[];
  total_results: number;
}

@Injectable()
export class PexelsProvider {
  private readonly logger = new Logger(PexelsProvider.name);
  private readonly baseUrl = 'https://api.pexels.com/v1';

  /**
   * Search Pexels for images matching subject + keywords and return raw image buffer.
   * @returns Buffer of the first matching image, or null if unavailable.
   */
  async fetchImageBuffer(subject: string, keywords: string[]): Promise<Buffer | null> {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      this.logger.warn('PEXELS_API_KEY is not set — skipping Pexels');
      return null;
    }

    const query = [subject, ...keywords].join(' ');

    try {
      const searchRes = await axios.get<PexelsSearchResponse>(`${this.baseUrl}/search`, {
        params: { query, per_page: 5, orientation: 'landscape' },
        headers: { Authorization: apiKey },
        timeout: 10_000,
      });

      const photo = searchRes.data.photos?.[0];
      if (!photo) {
        this.logger.warn({ msg: 'pexels_no_results', query });
        return null;
      }

      const imageUrl = photo.src.large2x || photo.src.large || photo.src.medium;
      const imageRes = await axios.get<ArrayBuffer>(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15_000,
      });

      return Buffer.from(imageRes.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ msg: 'pexels_fetch_failed', query, error: message });
      return null;
    }
  }
}
