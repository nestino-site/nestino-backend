import { Injectable } from '@nestjs/common';
import MarkdownIt = require('markdown-it');

@Injectable()
export class MarkdownRendererService {
  private readonly md = new MarkdownIt();

  render(markdown: string): string {
    const html = this.md.render(markdown);
    return this.stripInterTagNewlines(html);
  }

  /** Collapse newlines between tags so JSON clients do not see escaped `\n` between blocks. */
  private stripInterTagNewlines(html: string): string {
    return html.replace(/>\s*\n+\s*</g, '><').trim();
  }
}
