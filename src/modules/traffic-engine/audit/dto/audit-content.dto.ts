import { IsOptional, IsString } from 'class-validator';

export type InternalLinkingAuditStatus = 'approved' | 'needs_fix';

export interface InternalLinkingAudit {
  status: InternalLinkingAuditStatus;
  details: string;
}

export interface AuditResult {
  approved: boolean;
  eeat_score: number;
  critical_errors: string;
  seo_and_ux_recommendations: string;
  internal_linking_audit: InternalLinkingAudit;
  /** True when Gemini audit could not run (API/config); pipeline should not block on approval. */
  auditUnavailable?: boolean;
}

export interface AuditFixContext {
  keyword?: string;
  seoIssues?: string[];
  seoScore?: number;
}

export interface AuditAndFixResult {
  auditResult: AuditResult;
  /** Authoritative markdown for pipeline and DB — equals input when no fix was needed. */
  finalContent: string;
  contentChanged: boolean;
  fixAttempts: number;
}

export class AuditContentDto {
  @IsOptional()
  @IsString()
  content?: string;
}
