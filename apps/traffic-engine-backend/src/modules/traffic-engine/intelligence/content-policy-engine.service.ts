import { Injectable } from '@nestjs/common';

export interface PolicyViolation {
  code:
    | 'min_word_count'
    | 'placeholder_text'
    | 'repetitive_paragraphs'
    | 'empty_sections'
    | 'escaped_newlines'
    | 'malformed_markdown';
  message: string;
}

export interface PolicyValidationResult {
  passed: boolean;
  violations: PolicyViolation[];
}

@Injectable()
export class ContentPolicyEngineService {
  validate(content: string): PolicyValidationResult {
    const violations: PolicyViolation[] = [];
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    if (wordCount < 300) {
      violations.push({
        code: 'min_word_count',
        message: 'Content does not meet the minimum word count requirement.',
      });
    }

    if (/\[todo\]|lorem ipsum/gi.test(content)) {
      violations.push({
        code: 'placeholder_text',
        message: 'Content contains placeholder text.',
      });
    }

    const paragraphs = content
      .split(/\n{2,}/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    const unique = new Set(paragraphs);
    if (paragraphs.length > 3 && unique.size <= paragraphs.length - 2) {
      violations.push({
        code: 'repetitive_paragraphs',
        message: 'Content contains repetitive paragraphs.',
      });
    }

    if (this.hasEmptySections(content)) {
      violations.push({
        code: 'empty_sections',
        message: 'One or more sections are empty.',
      });
    }

    if (content.includes('\\n')) {
      violations.push({
        code: 'escaped_newlines',
        message: 'Content contains escaped newline sequences.',
      });
    }

    if (this.hasMalformedMarkdownStructure(content)) {
      violations.push({
        code: 'malformed_markdown',
        message: 'Markdown structure is invalid or incomplete.',
      });
    }

    return { passed: violations.length === 0, violations };
  }

  private hasEmptySections(content: string): boolean {
    const lines = content.split('\n').map((line) => line.trim());
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].startsWith('## ')) {
        let cursor = i + 1;
        while (cursor < lines.length && lines[cursor] === '') {
          cursor += 1;
        }
        const next = lines[cursor] ?? '';
        if (!next || next.startsWith('## ') || next.startsWith('# ')) {
          return true;
        }
      }
    }
    return false;
  }

  private hasMalformedMarkdownStructure(content: string): boolean {
    const hasH1 = /^#\s+/m.test(content);
    const h2Count = (content.match(/^##\s+/gm) ?? []).length;
    return !hasH1 || h2Count < 2;
  }
}
