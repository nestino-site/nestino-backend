import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface FetchedWebsiteData {
  url: string;
  resolvedUrl: string;
  statusCode: number;
  title?: string;
  rawText: string;
  hasFertilityTerms: boolean;
  hasAccreditationTerms: boolean;
  mentionedTreatments: string[];
}

const FERTILITY_TERMS = [
  'ivf', 'in vitro fertilisation', 'in vitro fertilization',
  'egg donation', 'embryo', 'reproductive', 'fertility', 'infertility',
  'icsi', 'iui', 'pgt-a', 'frozen embryo', 'vitrification',
  'fecundación in vitro', 'donación de óvulos', 'fertilidad',
  'clinique ivf', 'fiv', 'reprodução assistida',
];

const HAIR_RESTORATION_TERMS = [
  'hair transplant', 'hair restoration', 'fue', 'fut', 'dhi',
  'follicular unit extraction', 'follicular unit transplantation',
  'trasplante capilar', 'implante capilar', 'capilar',
  'saç ekimi', 'greffe de cheveux', 'greffe cheveux',
  'hairline design', 'graft', 'donor area',
];

const ACCREDITATION_TERMS = ['jci', 'eshre', 'iso 9001', 'hfea', 'sef member', 'redlara', 'cap accredited'];

const TREATMENT_MAP: Record<string, string> = {
  ivf: 'IVF',
  icsi: 'ICSI',
  'pgt-a': 'PGT_A',
  'egg donation': 'EGG_DONATION',
  'frozen embryo transfer': 'FET',
  iui: 'IUI',
  'embryo freezing': 'EMBRYO_FREEZING',
  'egg freezing': 'EGG_FREEZING',
  'hair transplant': 'HAIR_RESTORATION',
  'hair restoration': 'HAIR_RESTORATION',
  fue: 'HAIR_RESTORATION',
  fut: 'HAIR_RESTORATION',
  dhi: 'HAIR_RESTORATION',
};

@Injectable()
export class WebsiteFetcherAdapter {
  private readonly logger = new Logger(WebsiteFetcherAdapter.name);

  async fetch(url: string, timeoutMs = 8000): Promise<FetchedWebsiteData> {
    try {
      const response = await axios.get(url, {
        timeout: timeoutMs,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClinicInventoryBot/1.0)' },
        maxRedirects: 5,
      });

      const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      const text = body.replace(/<[^>]+>/g, ' ').toLowerCase();

      const hasFertilityTerms =
        FERTILITY_TERMS.some((t) => text.includes(t)) ||
        HAIR_RESTORATION_TERMS.some((t) => text.includes(t));
      const hasAccreditationTerms = ACCREDITATION_TERMS.some((t) => text.includes(t));

      const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : undefined;

      const mentionedTreatments = Object.entries(TREATMENT_MAP)
        .filter(([term]) => text.includes(term))
        .map(([, code]) => code);

      return {
        url,
        resolvedUrl: response.config.url ?? url,
        statusCode: response.status,
        title,
        rawText: text.slice(0, 5000),
        hasFertilityTerms,
        hasAccreditationTerms,
        mentionedTreatments: [...new Set(mentionedTreatments)],
      };
    } catch (err) {
      this.logger.debug(`Failed to fetch ${url}: ${String(err)}`);
      return {
        url,
        resolvedUrl: url,
        statusCode: 0,
        rawText: '',
        hasFertilityTerms: false,
        hasAccreditationTerms: false,
        mentionedTreatments: [],
      };
    }
  }
}
