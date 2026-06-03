import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface LlmExtractResult {
  services: string[];
  accreditations: string[];
  languages: string[];
  doctors: Array<{ name: string; title?: string }>;
  confidence: number;
  provider: string;
  model: string;
  tokensUsed: number;
}

export interface LlmPricingResult {
  packages: Array<{
    treatmentCode: string;
    packageName: string;
    currency: string;
    priceMin?: number;
    priceMax?: number;
    includes: string[];
    excludes: string[];
    confidence: number;
  }>;
  provider: string;
  model: string;
  tokensUsed: number;
}

const EXTRACT_STUB: LlmExtractResult = {
  services: ['IVF', 'ICSI', 'EGG_DONATION', 'FET'],
  accreditations: ['ESHRE', 'ISO_9001'],
  languages: ['en', 'es', 'fr'],
  doctors: [
    { name: 'Dr. María García', title: 'Reproductive Endocrinologist' },
    { name: 'Dr. Juan López', title: 'Embryologist' },
  ],
  confidence: 0.9,
  provider: 'stub',
  model: 'stub',
  tokensUsed: 0,
};

const PRICING_STUB: LlmPricingResult = {
  packages: [
    {
      treatmentCode: 'IVF',
      packageName: 'IVF Standard',
      currency: 'EUR',
      priceMin: 5500,
      priceMax: 8500,
      includes: ['Egg retrieval', 'Fertilisation', 'Embryo transfer', '1 monitoring scan'],
      excludes: ['ICSI (+€800)', 'Blast culture (+€500)', 'Vitrification (+€600)', 'Anesthesia (+€350)', 'Medication'],
      confidence: 0.85,
    },
  ],
  provider: 'stub',
  model: 'stub',
  tokensUsed: 0,
};

@Injectable()
export class LlmEnrichmentAdapter {
  private readonly logger = new Logger(LlmEnrichmentAdapter.name);

  constructor(private readonly config: ConfigService) {}

  private get isStub(): boolean {
    return (
      this.config.get<string>('AI_STUB') === 'true' ||
      this.config.get<string>('DISCOVERY_LLM_DISABLED') === 'true'
    );
  }

  async extract(websiteText: string, params: Record<string, unknown>): Promise<LlmExtractResult> {
    if (this.isStub) {
      this.logger.debug('LLM stub mode: returning extract stub');
      return EXTRACT_STUB;
    }

    const provider = (params.provider as string) ?? 'openai';
    const model = (params.model as string) ?? 'gpt-4o-mini';

    const prompt = `
You are analyzing an IVF clinic website. Extract structured information from the text below.

Return JSON with this exact structure:
{
  "services": ["IVF","ICSI","EGG_DONATION","FET","IUI","PGT_A","EMBRYO_FREEZING","EGG_FREEZING"],
  "accreditations": ["ESHRE","JCI","ISO_9001","HFEA","SEF"],
  "languages": ["en","es","fr","de"],
  "doctors": [{"name":"string","title":"string"}],
  "confidence": 0.0-1.0
}
Only include items actually mentioned. confidence = how sure you are of the data quality.

Website text:
${websiteText.slice(0, 3000)}
`.trim();

    return this.callOpenAI(model, prompt).then((response) => ({
      services: (response.services as string[]) ?? [],
      accreditations: (response.accreditations as string[]) ?? [],
      languages: (response.languages as string[]) ?? [],
      doctors: (response.doctors as LlmExtractResult['doctors']) ?? [],
      confidence: (response.confidence as number) ?? 0.5,
      tokensUsed: (response.tokensUsed as number) ?? 0,
      provider,
      model,
    }));
  }

  async extractPricing(websiteText: string, params: Record<string, unknown>): Promise<LlmPricingResult> {
    if (this.isStub) {
      this.logger.debug('LLM stub mode: returning pricing stub');
      return PRICING_STUB;
    }

    const provider = (params.provider as string) ?? 'openai';
    const model = (params.model as string) ?? 'gpt-4o-mini';

    const prompt = `
You are analyzing an IVF clinic website for pricing information.

Return JSON:
{
  "packages": [{
    "treatmentCode": "IVF|ICSI|EGG_DONATION|FET|IUI",
    "packageName": "string",
    "currency": "EUR|USD|GBP|CZK",
    "priceMin": number_or_null,
    "priceMax": number_or_null,
    "includes": ["list of included items"],
    "excludes": ["list of NOT included items / common add-ons"],
    "confidence": 0.0-1.0
  }]
}

Website text:
${websiteText.slice(0, 3000)}
`.trim();

    return this.callOpenAI(model, prompt).then((response) => ({
      packages: (response as { packages?: LlmPricingResult['packages'] }).packages ?? [],
      provider,
      model,
      tokensUsed: (response as { tokensUsed?: number }).tokensUsed ?? 0,
    }));
  }

  private async callOpenAI(model: string, prompt: string): Promise<Record<string, unknown>> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not set, returning empty result');
      return {};
    }

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 1000,
      },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      },
    );

    const data = response.data as {
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens: number };
    };

    const content = data.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return { ...parsed, tokensUsed: data.usage?.total_tokens ?? 0 };
  }
}
