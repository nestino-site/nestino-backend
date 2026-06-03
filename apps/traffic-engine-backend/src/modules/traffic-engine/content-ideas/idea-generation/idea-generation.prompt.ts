import { ContentTemplate, Subject } from '@prisma/client';

export interface IdeaGenerationPromptInput {
  subject: Subject & { template?: ContentTemplate | null };
  count: number;
}

export function buildIdeaGenerationPrompt(input: IdeaGenerationPromptInput): {
  system: string;
  user: string;
} {
  const { subject, count } = input;
  const template = subject.template;

  const templateBlock = template
    ? `
Template: ${template.name}
Content type: ${template.contentType}
Required sections: ${JSON.stringify(template.requiredSections)}
Heading structure: ${JSON.stringify(template.headingStructure)}
SEO rules: ${JSON.stringify(template.seoRules)}
FAQ structure: ${JSON.stringify(template.faqStructure)}
CTA placement: ${template.ctaPlacement ?? 'end'}
Internal linking rules: ${JSON.stringify(template.internalLinkingRules ?? {})}
Formatting: ${template.formattingInstructions ?? 'Standard SEO markdown'}
`
    : 'No template assigned — use best-practice SEO article structure.';

  const system = `You are an expert SEO strategist and content planner.
Return ONLY valid JSON — no markdown fences, no commentary.
Output must be a JSON array of exactly ${count} objects.
Each object MUST match this schema:
{
  "title": string,
  "slug": string (URL path starting with /, lowercase, hyphenated),
  "targetKeyword": string,
  "metaDescription": string (max 160 chars),
  "searchIntent": "INFORMATIONAL" | "NAVIGATIONAL" | "TRANSACTIONAL" | "COMMERCIAL",
  "outline": { "h2s": string[], "faq": { "q": string, "a": string }[] },
  "headings": string[],
  "faqSuggestions": { "q": string, "a": string }[],
  "internalLinkingSuggestions": string[],
  "contentType": "ARTICLE" | "LANDING_PAGE" | "CITY_PAGE" | "FAQ" | "COMPARISON" | "BLOG_POST",
  "confidenceScore": number (0-1),
  "hallucinationRiskScore": number (0-1, self-assessed factual risk)
}
Follow the assigned template structure strictly when template is provided.
Avoid unverifiable claims for high-risk topics. Use hedged language where facts are uncertain.`;

  const user = `Generate ${count} unique SEO content ideas for this subject.

Subject title: ${subject.title}
Description: ${subject.description ?? 'N/A'}
Primary keywords: ${subject.primaryKeywords.join(', ')}
Secondary keywords: ${subject.secondaryKeywords.join(', ')}
Search intent: ${subject.searchIntent}
Language: ${subject.language}
Location: ${[subject.city, subject.country].filter(Boolean).join(', ') || 'N/A'}
SEO goal: ${subject.seoGoal ?? 'organic traffic and conversions'}
Risk category: ${subject.riskCategory}
Hallucination sensitivity: ${subject.hallucinationSensitivity}
Strict factual validation required: ${subject.requiresFactualValidation}
${templateBlock}`;

  return { system, user };
}
