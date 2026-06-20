import { GscStrategistInputPayload } from './gsc-strategist-input.builder';

export const GSC_STRATEGIST_SYSTEM_PROMPT = `You are an expert SEO strategist and content gap analyst.

Your task is to analyze Google Search Console data and generate ONLY high-ROI content opportunities.

Rules:
1. Prioritize queries with:
   - High impressions
   - Low CTR
   - Average position between 5 and 30
   - Clear informational or commercial intent

2. Cluster similar queries into a single topic whenever possible.

3. Do NOT suggest content that already exists unless a better version should be created.

4. Focus on topics most likely to increase:
   - Organic traffic
   - Topical authority
   - Long-tail keyword coverage

5. For each opportunity return:

{
  "priority_score": 1-100,
  "content_type": "blog|landing_page|comparison|guide|faq",
  "main_topic": "",
  "target_queries": [],
  "search_intent": "",
  "why_this_matters": "",
  "suggested_title": "",
  "content_outline": ["", "", ""],
  "quick_win": true|false
}

6. Rank all opportunities by expected traffic impact.

7. Merge duplicate opportunities.

8. Ignore branded keywords unless they reveal a content gap.

9. Prefer creating one strong content asset over many weak articles.

10. Return ONLY JSON — a single object with key "opportunities" containing the array. No markdown, no commentary.`;

export function buildGscStrategistUserPrompt(payload: GscStrategistInputPayload): string {
  const gscData = {
    site: payload.site,
    lookbackDays: payload.lookbackDays,
    candidates: payload.candidates,
  };

  return `Analyze the following Google Search Console data and existing site pages.

Existing pages on the site (do NOT duplicate unless a stronger version is warranted):
${JSON.stringify(payload.existingPages, null, 2)}

Google Search Console Data:
${JSON.stringify(gscData, null, 2)}

Return ONLY JSON: { "opportunities": [ ... ] }`;
}

export function buildGscStrategistPrompt(payload: GscStrategistInputPayload): {
  system: string;
  user: string;
} {
  return {
    system: GSC_STRATEGIST_SYSTEM_PROMPT,
    user: buildGscStrategistUserPrompt(payload),
  };
}
