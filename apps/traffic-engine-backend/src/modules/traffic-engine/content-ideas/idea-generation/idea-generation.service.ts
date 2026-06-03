import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AiProvider,
  ContentType,
  IdeaStatus,
  KeywordIntent,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { AiOrchestratorService } from '../../ai/ai-orchestrator.service';
import { AiPipelineStepConfig } from '../../ai/types/ai-pipeline.types';
import { SubjectsService } from '../../subjects/services/subjects.service';
import { IdeaValidationService, ParsedIdeaDraft } from '../idea-validation.service';
import { buildIdeaGenerationPrompt } from './idea-generation.prompt';

const DEFAULT_GEMINI_MODEL = process.env.AI_IDEA_GENERATION_MODEL ?? 'gemini-3.1-flash-lite';

@Injectable()
export class IdeaGenerationService {
  private readonly logger = new Logger(IdeaGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subjectsService: SubjectsService,
    private readonly orchestrator: AiOrchestratorService,
    private readonly validation: IdeaValidationService,
  ) {}

  async generateForSubject(
    subjectId: number,
    count: number,
    provider: AiProvider = AiProvider.google,
  ): Promise<{ created: number; subjectId: number }> {
    const subject = await this.subjectsService.findOne(subjectId);
    if (!subject) {
      throw new NotFoundException(`Subject ${subjectId} not found`);
    }

    const subjectWithTemplate = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      include: { template: true },
    });
    if (!subjectWithTemplate) {
      throw new NotFoundException(`Subject ${subjectId} not found`);
    }

    const prompt = buildIdeaGenerationPrompt({
      subject: subjectWithTemplate,
      count,
    });

    const step: AiPipelineStepConfig = {
      stepKey: 'idea_generation',
      provider,
      model: this.resolveModel(provider),
      promptTemplateId: 'idea_generation_v1',
      maxOutputTokens: Math.min(8000, 400 + count * 350),
      timeoutMs: 180_000,
    };

    const output = await this.orchestrator.runStepWithPrompt(step, prompt);
    const ideas = this.parseIdeasJson(output.text);

    let created = 0;
    for (const draft of ideas.slice(0, count)) {
      const normalized = this.normalizeDraft(draft);
      if (!normalized) {
        continue;
      }

      const hallucinationRiskScore = this.validation.scoreHallucinationRisk(
        normalized,
        subjectWithTemplate,
      );
      const confidenceScore = normalized.confidenceScore ?? 0.7;
      const status = this.validation.resolveInitialStatus(
        subjectWithTemplate,
        hallucinationRiskScore,
        confidenceScore,
      );

      try {
        await this.prisma.contentIdea.create({
          data: {
            subjectId,
            title: normalized.title,
            slug: normalized.slug,
            targetKeyword: normalized.targetKeyword,
            metaDescription: normalized.metaDescription,
            searchIntent: this.parseIntent(normalized.searchIntent),
            outline: normalized.outline as Prisma.InputJsonValue | undefined,
            headings: normalized.headings ?? [],
            faqSuggestions: normalized.faqSuggestions as Prisma.InputJsonValue | undefined,
            internalLinkingSuggestions: normalized.internalLinkingSuggestions ?? [],
            contentType: this.parseContentType(normalized.contentType),
            confidenceScore,
            hallucinationRiskScore,
            status,
            generatedBy: provider,
            generatedModel: step.model,
          },
        });
        created += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn({ msg: 'content_idea_persist_skipped', subjectId, error: message });
      }
    }

    this.logger.log({ msg: 'ideas_generated', subjectId, requested: count, created });
    return { created, subjectId };
  }

  private resolveModel(provider: AiProvider): string {
    switch (provider) {
      case AiProvider.openai:
        return process.env.AI_IDEA_OPENAI_MODEL ?? 'gpt-4o-mini';
      case AiProvider.anthropic:
        return process.env.AI_IDEA_ANTHROPIC_MODEL ?? 'claude-3-5-haiku-20241022';
      case AiProvider.google:
      default:
        return DEFAULT_GEMINI_MODEL;
    }
  }

  private parseIdeasJson(text: string): ParsedIdeaDraft[] {
    const trimmed = text.trim();
    const jsonStart = trimmed.indexOf('[');
    const jsonEnd = trimmed.lastIndexOf(']');
    if (jsonStart < 0 || jsonEnd < 0) {
      throw new Error('AI response did not contain a JSON array');
    }
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error('AI response JSON is not an array');
    }
    return parsed as ParsedIdeaDraft[];
  }

  private normalizeDraft(draft: ParsedIdeaDraft): ParsedIdeaDraft | null {
    if (!draft.title?.trim() || !draft.targetKeyword?.trim()) {
      return null;
    }
    const slug = this.normalizeSlug(draft.slug, draft.title);
    return {
      ...draft,
      slug,
      title: draft.title.trim(),
      targetKeyword: draft.targetKeyword.trim(),
    };
  }

  private normalizeSlug(slug: string | undefined, title: string): string {
    const base =
      slug?.trim() ||
      `/${title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}`;
    return base.startsWith('/') ? base : `/${base}`;
  }

  private parseIntent(value?: string): KeywordIntent {
    const upper = (value ?? 'INFORMATIONAL').toUpperCase();
    if (Object.values(KeywordIntent).includes(upper as KeywordIntent)) {
      return upper as KeywordIntent;
    }
    return KeywordIntent.INFORMATIONAL;
  }

  private parseContentType(value?: string): ContentType {
    const upper = (value ?? 'ARTICLE').toUpperCase();
    if (Object.values(ContentType).includes(upper as ContentType)) {
      return upper as ContentType;
    }
    return ContentType.ARTICLE;
  }
}
