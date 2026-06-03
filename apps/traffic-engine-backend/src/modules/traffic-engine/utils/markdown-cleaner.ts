import { normalizeContentOutput, unwrapJsonArticleWrapper } from './content-normalizer';

export function cleanMarkdownOutput(content: string): string {
  return unwrapJsonArticleWrapper(normalizeContentOutput(content))
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

