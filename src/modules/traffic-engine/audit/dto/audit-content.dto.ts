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
}

export class AuditContentDto {
  @IsOptional()
  @IsString()
  content?: string;
}
