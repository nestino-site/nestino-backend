import { Injectable } from '@nestjs/common';
import { Site } from '@prisma/client';

/**
 * Merges site-level factual knowledge from Site.config into generation runtime context.
 */
@Injectable()
export class KnowledgeBaseService {
  mergeIntoRuntime(site: Site, runtime: Record<string, unknown>): Record<string, unknown> {
    const facts = this.extractFacts(site.config);
    if (!facts || Object.keys(facts).length === 0) {
      return runtime;
    }
    return {
      ...runtime,
      knowledgeBase: facts,
    };
  }

  extractFacts(config: unknown): Record<string, unknown> | null {
    if (config == null || typeof config !== 'object' || Array.isArray(config)) {
      return null;
    }
    const c = config as Record<string, unknown>;
    const kb = c.knowledgeBase ?? c.knowledge_base;
    if (kb && typeof kb === 'object' && !Array.isArray(kb)) {
      return kb as Record<string, unknown>;
    }
    return null;
  }
}
