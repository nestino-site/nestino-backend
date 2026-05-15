import { Injectable } from '@nestjs/common';
import MarkdownIt from 'markdown-it';

@Injectable()
export class MarkdownHtmlService {
  private readonly md: MarkdownIt;

  constructor() {
    this.md = new MarkdownIt({ html: false, linkify: true, typographer: true });
    this.applyHeadingAnchors();
  }

  toHtml(markdown: string): string {
    return this.md.render(markdown);
  }

  /** Adds id attributes to h2/h3 so tableOfContents anchors work in htmlContent. */
  private applyHeadingAnchors(): void {
    this.md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
      const token = tokens[idx];
      const level = Number(token.tag.slice(1));
      if (level === 2 || level === 3) {
        const inline = tokens[idx + 1];
        const text =
          inline?.type === 'inline' && inline.children
            ? inline.children.map((c) => ('content' in c ? c.content : '')).join('')
            : '';
        const id = this.slugifyHeading(text);
        return `<${token.tag} id="${id}">`;
      }
      return self.renderToken(tokens, idx, options);
    };
  }

  private slugifyHeading(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60);
  }
}
