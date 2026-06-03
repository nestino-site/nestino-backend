import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface PlaceSearchResult {
  placeId: string;
  name: string;
  formattedAddress?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  userRatingsTotal?: number;
  businessStatus?: string;
  websiteUri?: string;
  phone?: string;
  types?: string[];
}

export interface PlaceDetails extends PlaceSearchResult {
  website?: string;
  internationalPhoneNumber?: string;
  formattedPhoneNumber?: string;
  openingHours?: { weekdayDescriptions?: string[] };
  photos?: Array<{ name: string }>;
  reviews?: Array<{
    authorName?: string;
    rating?: number;
    text?: string;
    time?: number;
    language?: string;
  }>;
  googleMapsUrl?: string;
  editorialSummary?: string;
  priceLevel?: number;
  primaryType?: string;
  accessibilityOptions?: Record<string, unknown>;
  rawGooglePayload?: Record<string, unknown>;
  formattedPhone?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
}

interface LegacyTextSearchResponse {
  status: string;
  error_message?: string;
  results?: Array<{
    place_id: string;
    name: string;
    formatted_address?: string;
    geometry?: { location: { lat: number; lng: number } };
    rating?: number;
    user_ratings_total?: number;
    business_status?: string;
    types?: string[];
  }>;
  next_page_token?: string;
}

interface NewPlacesSearchResponse {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    rating?: number;
    userRatingCount?: number;
    businessStatus?: string;
    websiteUri?: string;
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    formattedPhoneNumber?: string;
    googleMapsUri?: string;
    regularOpeningHours?: { weekdayDescriptions?: string[] };
    photos?: Array<{ name: string }>;
    reviews?: Array<Record<string, unknown>>;
    editorialSummary?: { text?: string };
    priceLevel?: string | number;
    primaryType?: string;
    accessibilityOptions?: Record<string, unknown>;
    types?: string[];
  }>;
  nextPageToken?: string;
  error?: { message?: string; status?: string };
}

/** Legacy-only failures — do not retry legacy after New API errors. */
function isPermanentPlacesError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('referer restrictions cannot be used') ||
    m.includes('api key not valid')
  );
}

@Injectable()
export class GooglePlacesAdapter {
  private readonly logger = new Logger(GooglePlacesAdapter.name);
  private readonly apiKey: string;
  private readonly useNewApi: boolean;
  private readonly legacyBaseUrl = 'https://maps.googleapis.com/maps/api';
  private readonly newBaseUrl = 'https://places.googleapis.com/v1';

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('GOOGLE_PLACES_API_KEY') ?? '';
    this.useNewApi = this.config.get<string>('GOOGLE_PLACES_USE_NEW_API') !== 'false';
  }

  async searchNearby(params: {
    query: string;
    lat: number;
    lng: number;
    radiusKm: number;
    pageToken?: string;
  }): Promise<{ results: PlaceSearchResult[]; nextPageToken?: string }> {
    if (!this.apiKey) {
      this.logger.warn('GOOGLE_PLACES_API_KEY not set — returning stub results');
      return this.stubSearchResults(params.query);
    }

    if (this.useNewApi) {
      try {
        return await this.searchNearbyNew(params);
      } catch (err) {
        const msg = String(err);
        if (isPermanentPlacesError(msg)) throw err;
        this.logger.warn(`Places API (New) search failed: ${msg} — trying legacy API`);
      }
    }

    return this.searchNearbyLegacy(params);
  }

  async getPlaceDetails(placeId: string, fields: string[]): Promise<PlaceDetails> {
    if (!this.apiKey) {
      return this.stubPlaceDetails(placeId);
    }

    if (this.useNewApi) {
      try {
        return await this.getPlaceDetailsNew(placeId, fields);
      } catch (err) {
        const msg = String(err);
        if (isPermanentPlacesError(msg)) throw err;
        this.logger.warn(`Places API (New) details failed: ${msg} — trying legacy API`);
      }
    }

    return this.getPlaceDetailsLegacy(placeId, fields);
  }

  private async searchNearbyNew(params: {
    query: string;
    lat: number;
    lng: number;
    radiusKm: number;
    pageToken?: string;
  }): Promise<{ results: PlaceSearchResult[]; nextPageToken?: string }> {
    const body: Record<string, unknown> = {
      textQuery: params.query,
      locationBias: {
        circle: {
          center: { latitude: params.lat, longitude: params.lng },
          radius: params.radiusKm * 1000,
        },
      },
      maxResultCount: 20,
    };
    if (params.pageToken) body.pageToken = params.pageToken;

    let data: NewPlacesSearchResponse;
    try {
      ({ data } = await axios.post<NewPlacesSearchResponse>(
        `${this.newBaseUrl}/places:searchText`,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': [
              'places.id',
              'places.displayName',
              'places.formattedAddress',
              'places.location',
              'places.rating',
              'places.userRatingCount',
              'places.businessStatus',
              'places.websiteUri',
              'places.nationalPhoneNumber',
              'places.internationalPhoneNumber',
              'places.formattedPhoneNumber',
              'places.googleMapsUri',
              'places.regularOpeningHours',
              'places.photos',
              'places.reviews',
              'places.editorialSummary',
              'places.priceLevel',
              'places.primaryType',
              'places.accessibilityOptions',
              'places.types',
              'nextPageToken',
            ].join(','),
          },
        },
      ));
    } catch (err) {
      const apiMsg = axios.isAxiosError(err)
        ? (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message
        : undefined;
      throw new Error(apiMsg ?? String(err));
    }

    if (data.error) {
      throw new Error(data.error.message ?? 'Places API (New) search error');
    }

    const results: PlaceSearchResult[] = (data.places ?? []).map((p) => ({
      placeId: this.normalizePlaceId(p.id ?? ''),
      name: p.displayName?.text ?? 'Unknown',
      formattedAddress: p.formattedAddress,
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      rating: p.rating,
      userRatingsTotal: p.userRatingCount,
      businessStatus: p.businessStatus,
      websiteUri: p.websiteUri,
      phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber,
      internationalPhoneNumber: p.internationalPhoneNumber,
      formattedPhoneNumber: p.formattedPhoneNumber,
      openingHours: p.regularOpeningHours,
      regularOpeningHours: p.regularOpeningHours,
      photos: p.photos,
      reviews: this.mapNewReviews(p.reviews),
      googleMapsUrl: p.googleMapsUri,
      googleMapsUri: p.googleMapsUri,
      editorialSummary: p.editorialSummary?.text,
      priceLevel: this.mapNewPriceLevel(p.priceLevel),
      primaryType: p.primaryType,
      accessibilityOptions: p.accessibilityOptions,
      types: p.types,
      rawGooglePayload: p as Record<string, unknown>,
    }));

    return { results, nextPageToken: data.nextPageToken };
  }

  private async searchNearbyLegacy(params: {
    query: string;
    lat: number;
    lng: number;
    radiusKm: number;
    pageToken?: string;
  }): Promise<{ results: PlaceSearchResult[]; nextPageToken?: string }> {
    const { data } = await axios.get<LegacyTextSearchResponse>(
      `${this.legacyBaseUrl}/place/textsearch/json`,
      {
        params: {
          query: params.query,
          location: `${params.lat},${params.lng}`,
          radius: params.radiusKm * 1000,
          type: 'health',
          key: this.apiKey,
          pagetoken: params.pageToken,
        },
      },
    );

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      const msg = data.error_message ?? data.status;
      this.logger.error(`Google Places legacy text search failed: ${msg}`);
      throw new Error(msg);
    }

    const results: PlaceSearchResult[] = (data.results ?? []).map((r) => ({
      placeId: r.place_id,
      name: r.name,
      formattedAddress: r.formatted_address,
      lat: r.geometry?.location.lat,
      lng: r.geometry?.location.lng,
      rating: r.rating,
      userRatingsTotal: r.user_ratings_total,
      businessStatus: r.business_status,
      types: r.types,
    }));

    return { results, nextPageToken: data.next_page_token };
  }

  private async getPlaceDetailsNew(placeId: string, _fields: string[]): Promise<PlaceDetails> {
    const resourceId = encodeURIComponent(this.toNewApiPlaceResourceId(placeId));
    const { data } = await axios.get<Record<string, unknown>>(
      `${this.newBaseUrl}/places/${resourceId}`,
      {
        headers: {
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': [
            'id',
            'displayName',
            'formattedAddress',
            'location',
            'rating',
            'userRatingCount',
            'businessStatus',
            'websiteUri',
            'nationalPhoneNumber',
            'internationalPhoneNumber',
            'formattedPhoneNumber',
            'regularOpeningHours',
            'photos',
            'reviews',
            'googleMapsUri',
            'editorialSummary',
            'priceLevel',
            'primaryType',
            'accessibilityOptions',
            'types',
          ].join(','),
        },
      },
    );

    if (data.error) {
      const err = data.error as { message?: string };
      throw new Error(err.message ?? 'Places API (New) details error');
    }

    const opening = data.regularOpeningHours as { weekdayDescriptions?: string[] } | undefined;

    return {
      placeId: this.normalizePlaceId(String(data.id ?? placeId)),
      name: (data.displayName as { text?: string } | undefined)?.text ?? 'Unknown',
      formattedAddress: data.formattedAddress as string | undefined,
      lat: (data.location as { latitude?: number } | undefined)?.latitude,
      lng: (data.location as { longitude?: number } | undefined)?.longitude,
      website: data.websiteUri as string | undefined,
      websiteUri: data.websiteUri as string | undefined,
      googleMapsUrl: data.googleMapsUri as string | undefined,
      googleMapsUri: data.googleMapsUri as string | undefined,
      internationalPhoneNumber: (data.internationalPhoneNumber ?? data.nationalPhoneNumber) as string | undefined,
      nationalPhoneNumber: data.nationalPhoneNumber as string | undefined,
      formattedPhoneNumber: data.formattedPhoneNumber as string | undefined,
      formattedPhone: data.formattedPhoneNumber as string | undefined,
      businessStatus: data.businessStatus as string | undefined,
      rating: data.rating as number | undefined,
      userRatingsTotal: data.userRatingCount as number | undefined,
      openingHours: opening,
      regularOpeningHours: opening,
      photos: (data.photos as Array<{ name: string }> | undefined),
      reviews: this.mapNewReviews(data.reviews as Array<Record<string, unknown>> | undefined),
      editorialSummary: (data.editorialSummary as { text?: string } | undefined)?.text,
      priceLevel: this.mapNewPriceLevel(data.priceLevel as string | number | undefined),
      primaryType: data.primaryType as string | undefined,
      accessibilityOptions: data.accessibilityOptions as Record<string, unknown> | undefined,
      types: data.types as string[] | undefined,
      rawGooglePayload: data,
    };
  }

  private mapLegacyDetailFields(fields: string[]): string[] {
    const alias: Record<string, string> = {
      phone: 'international_phone_number',
      address: 'formatted_address',
      reviews: 'reviews',
    };
    const allowed = new Set([
      'website',
      'international_phone_number',
      'formatted_phone_number',
      'opening_hours',
      'photos',
      'reviews',
      'business_status',
      'formatted_address',
      'geometry',
      'rating',
      'user_ratings_total',
      'name',
      'place_id',
      'url',
      'editorial_summary',
      'price_level',
      'type',
    ]);
    const mapped = fields.map((f) => alias[f] ?? f).filter((f) => allowed.has(f));
    return mapped.length > 0
      ? mapped
      : [
        'website',
        'international_phone_number',
        'formatted_phone_number',
        'opening_hours',
        'photos',
        'reviews',
        'business_status',
        'formatted_address',
        'geometry',
        'rating',
        'user_ratings_total',
        'name',
        'place_id',
        'url',
        'editorial_summary',
        'price_level',
        'type',
      ];
  }

  private async getPlaceDetailsLegacy(placeId: string, fields: string[]): Promise<PlaceDetails> {
    const legacyFields = this.mapLegacyDetailFields(fields);
    const { data } = await axios.get<{ status: string; error_message?: string; result: Record<string, unknown> }>(
      `${this.legacyBaseUrl}/place/details/json`,
      {
        params: {
          place_id: placeId,
          fields: legacyFields.join(','),
          key: this.apiKey,
        },
      },
    );

    if (data.status !== 'OK') {
      const msg = data.error_message ?? data.status;
      this.logger.error(`Google Places legacy details failed: ${msg}`);
      throw new Error(msg);
    }

    const result = data.result;

    return {
      placeId,
      name: result.name as string,
      formattedAddress: result.formatted_address as string | undefined,
      lat: (result.geometry as { location?: { lat: number; lng: number } } | undefined)?.location?.lat,
      lng: (result.geometry as { location?: { lat: number; lng: number } } | undefined)?.location?.lng,
      website: result.website as string | undefined,
      websiteUri: result.website as string | undefined,
      googleMapsUrl: result.url as string | undefined,
      googleMapsUri: result.url as string | undefined,
      internationalPhoneNumber: result.international_phone_number as string | undefined,
      formattedPhoneNumber: result.formatted_phone_number as string | undefined,
      formattedPhone: result.formatted_phone_number as string | undefined,
      businessStatus: result.business_status as string | undefined,
      rating: result.rating as number | undefined,
      userRatingsTotal: result.user_ratings_total as number | undefined,
      openingHours: result.opening_hours as { weekdayDescriptions?: string[] } | undefined,
      photos: result.photos as Array<{ name: string }> | undefined,
      reviews: this.mapLegacyReviews(result.reviews as Array<Record<string, unknown>> | undefined),
      editorialSummary: (result.editorial_summary as { overview?: string } | undefined)?.overview,
      priceLevel: result.price_level as number | undefined,
      types: result.types as string[] | undefined,
      rawGooglePayload: result,
    };
  }

  private mapNewPriceLevel(value: string | number | undefined): number | undefined {
    if (typeof value === 'number') return value;
    if (!value) return undefined;
    const levels: Record<string, number> = {
      PRICE_LEVEL_FREE: 0,
      PRICE_LEVEL_INEXPENSIVE: 1,
      PRICE_LEVEL_MODERATE: 2,
      PRICE_LEVEL_EXPENSIVE: 3,
      PRICE_LEVEL_VERY_EXPENSIVE: 4,
    };
    return levels[value];
  }

  private mapNewReviews(reviews?: Array<Record<string, unknown>>): PlaceDetails['reviews'] {
    return reviews?.map((review) => ({
      authorName: (review.authorAttribution as { displayName?: string } | undefined)?.displayName,
      rating: review.rating as number | undefined,
      text: (review.text as { text?: string } | undefined)?.text,
      time: review.publishTime ? new Date(review.publishTime as string).getTime() : undefined,
      language: (review.text as { languageCode?: string } | undefined)?.languageCode,
    }));
  }

  private mapLegacyReviews(reviews?: Array<Record<string, unknown>>): PlaceDetails['reviews'] {
    return reviews?.map((review) => ({
      authorName: review.author_name as string | undefined,
      rating: review.rating as number | undefined,
      text: review.text as string | undefined,
      time: review.time as number | undefined,
      language: review.language as string | undefined,
    }));
  }

  private normalizePlaceId(id: string): string {
    return id.startsWith('places/') ? id.slice('places/'.length) : id;
  }

  private toNewApiPlaceResourceId(placeId: string): string {
    return placeId.startsWith('places/') ? placeId : `places/${placeId}`;
  }

  private stubSearchResults(query: string): { results: PlaceSearchResult[]; nextPageToken?: string } {
    return {
      results: [
        {
          placeId: `STUB_PLACE_001_${Date.now()}`,
          name: `Stub IVF Clinic Alpha (${query})`,
          formattedAddress: '123 Main Street, Barcelona, Spain',
          lat: 41.3968,
          lng: 2.161,
          rating: 4.5,
          userRatingsTotal: 120,
          businessStatus: 'OPERATIONAL',
          types: ['health', 'doctor', 'establishment'],
        },
      ],
    };
  }

  private stubPlaceDetails(placeId: string): PlaceDetails {
    return {
      placeId,
      name: 'Stub Clinic Details',
      formattedAddress: '123 Main Street, Barcelona, Spain',
      lat: 41.3968,
      lng: 2.161,
      website: 'https://stub-clinic-website.example.com',
      websiteUri: 'https://stub-clinic-website.example.com',
      internationalPhoneNumber: '+34 93 000 0000',
      formattedPhoneNumber: '93 000 00 00',
      businessStatus: 'OPERATIONAL',
      rating: 4.5,
      userRatingsTotal: 120,
      googleMapsUrl: 'https://maps.google.com/?cid=stub',
      editorialSummary: 'Stub fertility clinic profile for local development.',
      priceLevel: 2,
      types: ['health', 'doctor', 'establishment'],
    };
  }
}
