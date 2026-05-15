import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ParseIntParam } from '../../../common/pipes/parse-int-param.decorator';
import { PipelineStep } from '../ai/types/ai-execution.types';
import { PromptDebugService } from './prompt-debug.service';

const STEPS: PipelineStep[] = [
  'generate',
  'analyze',
  'rewrite',
  'image_generation',
  'seo_check',
];

@Controller('debug/prompt')
export class PromptDebugController {
  constructor(private readonly promptDebug: PromptDebugService) {}

  /**
   * Returns the composed system/user prompts and resolved model (no LLM call).
   * Query `generateMode=outline|draft` applies when step=generate (default: draft).
   */
  @Get(':pageId')
  async getPrompt(
    @ParseIntParam('pageId') pageId: number,
    @Query('step') stepRaw: string,
    @Query('generateMode') generateModeRaw?: string,
  ) {
    if (!stepRaw || !STEPS.includes(stepRaw as PipelineStep)) {
      throw new BadRequestException(`step must be one of: ${STEPS.join(', ')}`);
    }
    const step = stepRaw as PipelineStep;
    let generateMode: 'outline' | 'draft' = 'draft';
    if (step === 'generate') {
      if (generateModeRaw === 'outline' || generateModeRaw === 'draft') {
        generateMode = generateModeRaw;
      } else if (generateModeRaw !== undefined && generateModeRaw !== '') {
        throw new BadRequestException('generateMode must be outline or draft');
      }
    }

    return this.promptDebug.previewPrompt(pageId, step, generateMode);
  }
}
