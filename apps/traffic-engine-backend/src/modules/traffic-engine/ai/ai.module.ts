import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { AiProviderRegistry } from './ai-provider.registry';
import { AiExecutionService } from './execution/ai-execution.service';
import { CostControllerService } from './execution/cost-controller.service';
import { AiModelRouterService } from './model-router/ai-model-router.service';
import { PromptTemplateRegistry } from './prompt-template.registry';
import { PromptCompositionEngineService } from './prompt-engine/prompt-composition-engine.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GoogleGeminiProvider } from './providers/google-gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    PromptTemplateRegistry,
    OpenAiProvider,
    AnthropicProvider,
    GoogleGeminiProvider,
    AiProviderRegistry,
    AiOrchestratorService,
    AiModelRouterService,
    CostControllerService,
    PromptCompositionEngineService,
    AiExecutionService,
  ],
  exports: [
    AiOrchestratorService,
    PromptTemplateRegistry,
    AiProviderRegistry,
    AiModelRouterService,
    CostControllerService,
    PromptCompositionEngineService,
    AiExecutionService,
  ],
})
export class AiModule {}
