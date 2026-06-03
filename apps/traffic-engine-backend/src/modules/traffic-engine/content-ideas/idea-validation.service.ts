import { Injectable } from '@nestjs/common';
import {
  HallucinationSensitivity,
  IdeaStatus,
  RiskCategory,
  Subject,
} from '@prisma/client';

export interface ParsedIdeaDraft {
  title: string;
  slug: string;
  targetKeyword: string;
  metaDescription?: string;
  searchIntent?: string;
  outline?: unknown;
  headings?: string[];
  faqSuggestions?: unknown;
  internalLinkingSuggestions?: string[];
  contentType?: string;
  confidenceScore?: number;
  hallucinationRiskScore?: number;
}

const SENSITIVE_RISK_CATEGORIES: RiskCategory[] = [
  RiskCategory.MEDICAL,
  RiskCategory.LEGAL,
  RiskCategory.FINANCIAL,
  RiskCategory.IMMIGRATION,
  RiskCategory.PRICING,
];

const SUSPICIOUS_PATTERNS: RegExp[] = [
  /\b(guaranteed|100%|always works|miracle cure|instant approval)\b/i,
  /\b(#1 best|cheapest ever|lowest price guaranteed)\b/i,
  /\b(no side effects|FDA approved without)\b/i,
  /\b(visa guaranteed|passport in \d+ days guaranteed)\b/i,
];

@Injectable()
export class IdeaValidationService {
  requiresStrictReview(subject: Subject): boolean {
    if (subject.strictReviewMode) {
      return true;
    }
    if (subject.hallucinationSensitivity === HallucinationSensitivity.CRITICAL) {
      return true;
    }
    return SENSITIVE_RISK_CATEGORIES.includes(subject.riskCategory);
  }

  scoreHallucinationRisk(idea: ParsedIdeaDraft, subject: Subject): number {
    let score = idea.hallucinationRiskScore ?? 0.2;

    if (SENSITIVE_RISK_CATEGORIES.includes(subject.riskCategory)) {
      score += 0.25;
    }
    if (subject.requiresFactualValidation) {
      score += 0.15;
    }
    if (subject.hallucinationSensitivity === HallucinationSensitivity.HIGH) {
      score += 0.1;
    }
    if (subject.hallucinationSensitivity === HallucinationSensitivity.CRITICAL) {
      score += 0.2;
    }

    const textBlob = [
      idea.title,
      idea.metaDescription ?? '',
      JSON.stringify(idea.outline ?? {}),
      ...(idea.headings ?? []),
    ].join(' ');

    const flags = this.flagSuspiciousContent(textBlob);
    score += Math.min(flags.length * 0.08, 0.35);

    if ((idea.confidenceScore ?? 1) < 0.5) {
      score += 0.15;
    }

    return Math.min(Math.max(score, 0), 1);
  }

  flagSuspiciousContent(text: string): string[] {
    const issues: string[] = [];
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(text)) {
        issues.push(`suspicious_pattern:${pattern.source.slice(0, 40)}`);
      }
    }
    return issues;
  }

  resolveInitialStatus(
    subject: Subject,
    hallucinationRiskScore: number,
    confidenceScore: number,
  ): IdeaStatus {
    const threshold = this.getRiskThreshold(subject);

    if (this.requiresStrictReview(subject)) {
      if (hallucinationRiskScore > threshold || confidenceScore < 0.55) {
        return IdeaStatus.NEEDS_REVISION;
      }
      return IdeaStatus.PENDING_REVIEW;
    }

    if (hallucinationRiskScore > threshold) {
      return IdeaStatus.NEEDS_REVISION;
    }

    return IdeaStatus.PENDING_REVIEW;
  }

  getRiskThreshold(subject: Subject): number {
    switch (subject.hallucinationSensitivity) {
      case HallucinationSensitivity.LOW:
        return 0.85;
      case HallucinationSensitivity.MEDIUM:
        return 0.7;
      case HallucinationSensitivity.HIGH:
        return 0.55;
      case HallucinationSensitivity.CRITICAL:
        return 0.4;
      default:
        return 0.7;
    }
  }

  isBulkApproveBlocked(
    hallucinationRiskScore: number,
    riskCategory: RiskCategory,
  ): boolean {
    if (hallucinationRiskScore <= 0.7) {
      return false;
    }
    return SENSITIVE_RISK_CATEGORIES.includes(riskCategory);
  }
}
