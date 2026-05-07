import { Injectable } from '@nestjs/common';
import { marked } from 'marked';

@Injectable()
export class MarkdownRendererService {
  render(markdown: string): string {
    const html = marked.parse(markdown, { async: false }) as string;
    return this.stripInterTagNewlines(html);
  }

  /** Collapse newlines between tags so JSON clients do not see escaped `\n` between blocks. */
  private stripInterTagNewlines(html: string): string {
    return html.replace(/>\s*\n+\s*</g, '><').trim();
  }
}

