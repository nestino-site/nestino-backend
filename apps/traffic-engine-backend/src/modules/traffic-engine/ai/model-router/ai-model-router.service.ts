import { Injectable } from '@nestjs/common';
import { KeywordIntent } from '@prisma/client';
import { ModelConfig } from '../../config/config.types';
import { SiteConfigService } from '../../config/site-config.service';
import { ModelResolutionContext } from '../types/ai-execution.types';

@Injectable()
export class AiModelRouterService {
  constructor(private readonly siteConfigService: SiteConfigService) {}

  async resolve(context: ModelResolutionContext): Promise<string> {
    const siteConfig = await this.siteConfigService.getForSite(context.siteId);
    const modelConfig = siteConfig.modelConfig as ModelConfig;

    if (context.step === 'image_generation') {
      return modelConfig.image_generation;
    }
    if (context.step === 'seo_check') {
      return modelConfig.seo_check;
    }

    if (context.budgetAction === 'downgrade_model') {
      return modelConfig.rules.fallback;
    }

    // High-priority or explicitly important intent: always use high-priority model
    if (context.priority >= 8) {
      return modelConfig.rules.highPriority;
    }

    // Transactional / commercial content needs the stronger model for conversion copy
    if (
      context.step === 'generate' &&
      (context.intent === KeywordIntent.TRANSACTIONAL || context.intent === KeywordIntent.COMMERCIAL)
    ) {
      return modelConfig.rules.highPriority;
    }

    if (context.priority <= 3) {
      return modelConfig.rules.lowPriority;
    }
    return modelConfig[context.step];
  }
}
