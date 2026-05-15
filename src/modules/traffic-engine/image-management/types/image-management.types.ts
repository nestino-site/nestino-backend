export type ImageMode = 'real' | 'ai';

export interface LocationData {
  lat: number;
  lng: number;
  isSpecificPlace: boolean;
}

export interface FetchImageInput {
  /** Main topic or place name, e.g. "Outpost Coworking Canggu Bali" */
  subject: string;
  /** SEO keywords for search and alt text */
  keywords: string[];
  /** 'real' = stock/location photo, 'ai' = AI-generated illustration */
  mode: ImageMode;
  /** Optional location context to trigger Google Places vs Pexels */
  locationData?: LocationData;
}

export interface ProcessedImageResult {
  /** Absolute path to the saved .webp file */
  filePath: string;
  /** SEO-friendly kebab-case filename, e.g. outpost-coworking-canggu-bali.webp */
  seoFilename: string;
  /** Descriptive alt text for the image */
  altText: string;
  /** Width of the processed output in px */
  width: number;
  /** Height of the processed output in px */
  height: number;
  /** Source that was used: 'google_places' | 'pexels' | 'openai' | 'imagen' | 'placeholder' */
  source: ImageSource;
}

export type ImageSource = 'google_places' | 'pexels' | 'openai' | 'imagen' | 'placeholder';
