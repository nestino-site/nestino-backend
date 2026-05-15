import { Injectable } from '@nestjs/common';
import { KeywordIntent, Prisma } from '@prisma/client';

interface FaqEntry {
  question: string;
  answer: string;
}

export interface SchemaPageInput {
  slug: string;
  title?: string | null;
  metaDescription?: string | null;
  finalContent?: string | null;
  keyword: string;
  intent: KeywordIntent;
  domain: string;
  siteName: string;
  datePublished?: Date;
  dateModified?: Date;
  imageUrl?: string | null;
}

@Injectable()
export class SchemaMarkupService {
  generate(input: SchemaPageInput): Prisma.InputJsonValue {
    const url = this.buildAbsoluteUrl(input.domain, input.slug);
    const faq = this.extractFaq(input.finalContent ?? '');
    const schema: Record<string, unknown>[] = [];
    const published = (input.datePublished ?? new Date()).toISOString();
    const modified = (input.dateModified ?? input.datePublished ?? new Date()).toISOString();

    if (input.intent === KeywordIntent.INFORMATIONAL) {
      schema.push(this.buildBlogPostingSchema(input, url, published, modified));
      if (faq.length >= 2) {
        schema.push(this.buildFaqSchema(faq));
      }
      schema.push(this.buildBreadcrumbSchema(url, input.slug, input.title));
    } else if (input.intent === KeywordIntent.TRANSACTIONAL) {
      schema.push(this.buildLodgingOrProductSchema(input, url, published, modified));
      if (faq.length >= 2) {
        schema.push(this.buildFaqSchema(faq));
      }
    } else if (input.intent === KeywordIntent.COMMERCIAL) {
      schema.push(this.buildArticleSchema(input, url, published, modified));
      if (faq.length >= 2) {
        schema.push(this.buildFaqSchema(faq));
      }
    } else {
      schema.push(this.buildWebPageSchema(input, url));
      schema.push(this.buildBreadcrumbSchema(url, input.slug, input.title));
    }

    return schema as Prisma.InputJsonValue;
  }

  private buildAbsoluteUrl(domain: string, slug: string): string {
    const base = domain.startsWith('http://') || domain.startsWith('https://') ? domain : `https://${domain}`;
    const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const normalizedSlug = slug.startsWith('/') ? slug : `/${slug}`;
    return `${normalizedBase}${normalizedSlug}`;
  }

  private publisherBlock(input: SchemaPageInput): Record<string, unknown> {
    return {
      '@type': 'Organization',
      name: input.siteName,
      url: this.buildAbsoluteUrl(input.domain, '/'),
    };
  }

  private buildBlogPostingSchema(
    input: SchemaPageInput,
    url: string,
    datePublished: string,
    dateModified: string,
  ): Record<string, unknown> {
    const block: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: input.title ?? input.keyword,
      description: input.metaDescription ?? `Guide about ${input.keyword}`,
      author: this.publisherBlock(input),
      publisher: this.publisherBlock(input),
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      datePublished,
      dateModified,
    };
    if (input.imageUrl) {
      block.image = input.imageUrl;
    }
    return block;
  }

  private buildArticleSchema(
    input: SchemaPageInput,
    url: string,
    datePublished: string,
    dateModified: string,
  ): Record<string, unknown> {
    const block: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: input.title ?? input.keyword,
      description: input.metaDescription ?? `Article about ${input.keyword}`,
      author: this.publisherBlock(input),
      publisher: this.publisherBlock(input),
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      datePublished,
      dateModified,
    };
    if (input.imageUrl) {
      block.image = input.imageUrl;
    }
    return block;
  }

  private buildLodgingOrProductSchema(
    input: SchemaPageInput,
    url: string,
    datePublished: string,
    dateModified: string,
  ): Record<string, unknown> {
    const isLodging = /villa|hotel|resort|stay|accommodation|rental/i.test(input.keyword);
    if (isLodging) {
      return {
        '@context': 'https://schema.org',
        '@type': 'LodgingBusiness',
        name: input.title ?? input.keyword,
        description: input.metaDescription ?? `Details for ${input.keyword}`,
        url,
        datePublished,
        dateModified,
        publisher: this.publisherBlock(input),
      };
    }
    return {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: input.title ?? input.keyword,
      description: input.metaDescription ?? `Details for ${input.keyword}`,
      brand: { '@type': 'Brand', name: input.siteName },
      offers: {
        '@type': 'Offer',
        url,
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
      },
    };
  }

  private buildWebPageSchema(input: SchemaPageInput, url: string): Record<string, unknown> {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: input.title ?? input.keyword,
      description: input.metaDescription ?? `Page about ${input.keyword}`,
      url,
    };
  }

  private buildFaqSchema(faq: FaqEntry[]): Record<string, unknown> {
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((entry) => ({
        '@type': 'Question',
        name: entry.question,
        acceptedAnswer: { '@type': 'Answer', text: entry.answer },
      })),
    };
  }

  private buildBreadcrumbSchema(url: string, slug: string, title?: string | null): Record<string, unknown> {
    const segments = slug.split('/').filter(Boolean);
    const breadcrumbItems = [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: new URL('/', url).toString(),
      },
      ...segments.map((segment, idx) => ({
        '@type': 'ListItem',
        position: idx + 2,
        name: idx === segments.length - 1 ? (title?.trim() || segment) : segment,
        item: new URL(`/${segments.slice(0, idx + 1).join('/')}`, url).toString(),
      })),
    ];
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems,
    };
  }

  private extractFaq(content: string): FaqEntry[] {
    const faqHeader = content.match(/^##\s+FAQ\s*$/im);
    if (!faqHeader || faqHeader.index == null) {
      return [];
    }
    const lines = content.slice(faqHeader.index).split('\n');
    const entries: FaqEntry[] = [];
    let currentQuestion = '';
    let currentAnswer: string[] = [];
    let sawFaqHeader = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      if (!sawFaqHeader) {
        sawFaqHeader = /^##\s+faq\s*$/i.test(line);
        continue;
      }
      if (/^##\s+/.test(line)) {
        break;
      }
      const question = line.match(/^###\s+(.+)$/);
      if (question) {
        if (currentQuestion && currentAnswer.length > 0) {
          entries.push({ question: currentQuestion, answer: currentAnswer.join(' ').trim() });
        }
        currentQuestion = question[1].trim();
        currentAnswer = [];
        continue;
      }
      if (currentQuestion) {
        currentAnswer.push(line);
      }
    }

    if (currentQuestion && currentAnswer.length > 0) {
      entries.push({ question: currentQuestion, answer: currentAnswer.join(' ').trim() });
    }
    return entries.slice(0, 10);
  }
}
