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

/** True when the SEO gate should hard-fail on YMYL audit (substantive issues only). */
export function hasBlockingAuditFailure(audit: AuditResult): boolean {
  if (audit.auditUnavailable) {
    return false;
  }
  if (audit.approved) {
    return false;
  }
  if (audit.critical_errors.trim().length > 0) {
    return true;
  }
  return (
    audit.internal_linking_audit.status === 'needs_fix' &&
    audit.internal_linking_audit.details.trim().length > 0
  );
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
  /** First audit passed — pipeline should not block on later re-audit noise. */
  initiallyApproved?: boolean;
}

export class AuditContentDto {
  @IsOptional()
  @IsString()
  content?: string;
}
