import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditModule } from './audit/audit.module';
import { ConfigModule } from './config/config.module';
import { ContentApiModule } from './content-api/content-api.module';
import { ContentPreviewModule } from './content-preview/content-preview.module';
import { ContentIdeasModule } from './content-ideas/content-ideas.module';
import { ContentTasksModule } from './content-tasks/content-tasks.module';
import { IdeaTasksModule } from './idea-tasks/idea-tasks.module';
import { ImageManagementModule } from './image-management/image-management.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { KeywordResearchModule } from './keyword-research/keyword-research.module';
import { KeywordsModule } from './keywords/keywords.module';
import { ObservabilityModule } from './observability/observability.module';
import { PagesModule } from './pages/pages.module';
import { PipelineV3Module } from './pipeline-v3/pipeline-v3.module';
import { PromptDebugModule } from './prompt-debug/prompt-debug.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { SeoMetricsModule } from './seo-metrics/seo-metrics.module';
import { SeoStrategyModule } from './seo-strategy/seo-strategy.module';
import { SitesModule } from './sites/sites.module';
import { SubjectsModule } from './subjects/subjects.module';
import { TemplatesModule } from './templates/templates.module';
import { TrafficEngineBullQueuesModule } from './traffic-engine-bull.module';

@Module({
  imports: [
    TrafficEngineBullQueuesModule,
    ConfigModule,
    SitesModule,
    TemplatesModule,
    SubjectsModule,
    ContentIdeasModule,
    IdeaTasksModule,
    ImageManagementModule,
    KeywordsModule,
    PagesModule,
    PipelineV3Module,
    ContentTasksModule,
    ContentApiModule,
    ContentPreviewModule,
    IntelligenceModule,
    ObservabilityModule,
    SeoMetricsModule,
    SeoStrategyModule,
    KeywordResearchModule,
    AnalyticsModule,
    EvaluationModule,
    SchedulingModule,
    PromptDebugModule,
    AuditModule,
  ],
})
export class TrafficEngineModule {}
