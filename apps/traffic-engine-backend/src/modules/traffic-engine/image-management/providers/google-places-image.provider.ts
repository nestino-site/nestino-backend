import { Injectable, Logger } from '@nestjs/common';
import {
  Client as GoogleMapsClient,
  PlacesNearbyRanking,
} from '@googlemaps/google-maps-services-js';
import axios from 'axios';
import { LocationData } from '../types/image-management.types';

@Injectable()
export class GooglePlacesImageProvider {
  private readonly logger = new Logger(GooglePlacesImageProvider.name);
  private readonly mapsClient = new GoogleMapsClient();

  /**
   * Fetch an image buffer for a specific place using Google Places API.
   * Falls back to null if the place or photos are not found.
   */
  async fetchImageBuffer(
    subject: string,
    location: LocationData,
  ): Promise<Buffer | null> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      this.logger.warn('GOOGLE_PLACES_API_KEY is not set — skipping Google Places');
      return null;
    }

    try {
      const nearbyRes = await this.mapsClient.placesNearby({
        params: {
          location: { lat: location.lat, lng: location.lng },
          radius: 500,
          keyword: subject,
          rankby: PlacesNearbyRanking.prominence,
          key: apiKey,
        },
        timeout: 10_000,
      });

      const place = nearbyRes.data.results?.[0];
      const photoRef = place?.photos?.[0]?.photo_reference;
      if (!photoRef) {
        this.logger.warn({ msg: 'google_places_no_photo', subject });
        return null;
      }

      const photoUrl =
        `https://maps.googleapis.com/maps/api/place/photo` +
        `?maxwidth=1200&photo_reference=${encodeURIComponent(photoRef)}&key=${encodeURIComponent(apiKey)}`;

      const imageRes = await axios.get<ArrayBuffer>(photoUrl, {
        responseType: 'arraybuffer',
        timeout: 15_000,
        maxRedirects: 5,
      });

      return Buffer.from(imageRes.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ msg: 'google_places_fetch_failed', subject, error: message });
      return null;
    }
  }
}
