import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AiModule } from '../ai/ai.module';
import { BriefModule } from '../brief/brief.module';
import { ConfigModule } from '../config/config.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { PublishingModule } from '../publishing/publishing.module';
import { ObservabilityModule } from '../observability/observability.module';
import { SeoStrategyModule } from '../seo-strategy/seo-strategy.module';
import { AnalysisService } from './analysis.service';
import { GenerationService } from './generation.service';
import { ImageGenerationService } from './image-generation.service';
import { PipelineCheckpointService } from './pipeline-checkpoint.service';
import { RewriteService } from './rewrite.service';
import { SeoCheckService } from './seo-check.service';
import { TrafficEnginePipelineService } from './traffic-engine-pipeline.service';

@Module({
  imports: [
    AuditModule,
    ConfigModule,
    AiModule,
    BriefModule,
    IntelligenceModule,
    SeoStrategyModule,
    ObservabilityModule,
    forwardRef(() => PublishingModule),
  ],
  providers: [
    PipelineCheckpointService,
    GenerationService,
    AnalysisService,
    RewriteService,
    ImageGenerationService,
    SeoCheckService,
    TrafficEnginePipelineService,
  ],
  exports: [
    PipelineCheckpointService,
    TrafficEnginePipelineService,
    ImageGenerationService,
    SeoCheckService,
  ],
})
export class PipelineV3Module {}
