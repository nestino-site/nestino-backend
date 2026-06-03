import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { cleanMarkdownOutput } from '../utils/markdown-cleaner';
import { FaqItem, TocItem } from './next-js-contract-mapper.service';
import { MarkdownHtmlService } from './markdown-html.service';

export interface RenderedPageContent {
  htmlContent: string | null;
  tableOfContents: TocItem[];
  faq: FaqItem[];
}

@Injectable()
export class ContentRenderService {
  constructor(private readonly markdownHtml: MarkdownHtmlService) {}

  renderFromMarkdown(finalContent: string | null | undefined): RenderedPageContent {
    if (finalContent == null) {
      return { htmlContent: null, tableOfContents: [], faq: [] };
    }

    const cleaned = cleanMarkdownOutput(finalContent);
    return {
      htmlContent: this.markdownHtml.toHtml(cleaned),
      tableOfContents: this.buildToc(cleaned),
      faq: this.extractFaq(cleaned),
    };
  }

  toJsonFields(rendered: RenderedPageContent): {
    htmlContent: string | null;
    tableOfContents: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    faq: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  } {
    return {
      htmlContent: rendered.htmlContent,
      tableOfContents:
        rendered.tableOfContents.length > 0
          ? (rendered.tableOfContents as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      faq:
        rendered.faq.length > 0
          ? (rendered.faq as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
    };
  }

  private buildToc(content: string): TocItem[] {
    const lines = content.split('\n');
    const items: TocItem[] = [];
    let position = 0;
    for (const line of lines) {
      const h2 = line.match(/^##\s+(.+)$/);
      const h3 = line.match(/^###\s+(.+)$/);
      if (h2) {
        items.push({
          level: 2,
          text: h2[1].trim(),
          anchor: this.slugifyHeading(h2[1]),
        });
        position++;
      } else if (h3) {
        items.push({
          level: 3,
          text: h3[1].trim(),
          anchor: this.slugifyHeading(h3[1]),
        });
        position++;
      }
      if (position >= 20) break;
    }
    return items;
  }

  private extractFaq(content: string): FaqItem[] {
    const faqItems: FaqItem[] = [];
    const faqSectionMatch = content.match(
      /##\s+(?:FAQ|Frequently Asked Questions)[^\n]*([\s\S]*?)(?=\n##|\s*$)/i,
    );
    if (!faqSectionMatch) return faqItems;

    const section = faqSectionMatch[1];
    const qBlocks = section.split(/\n###\s+/).filter(Boolean);
    for (const block of qBlocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 2) continue;
      const question = lines[0].replace(/^\?+/, '').trim();
      const answer = lines.slice(1).join('\n').trim();
      if (question && answer) {
        faqItems.push({ question, answer });
      }
      if (faqItems.length >= 8) break;
    }
    return faqItems;
  }

  private slugifyHeading(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60);
  }
}
