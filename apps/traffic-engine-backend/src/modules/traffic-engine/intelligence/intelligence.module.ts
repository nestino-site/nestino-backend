import { Module } from '@nestjs/common';
import { ContentPolicyEngineService } from './content-policy-engine.service';
import { ContentScoringService } from './content-scoring.service';
import { KeywordIntentClassifierService } from './keyword-intent-classifier.service';
import { ClusterBuilderService } from './keyword-intelligence/cluster-builder.service';
import { ContentCoverageEngineService } from './keyword-intelligence/content-coverage-engine.service';
import { IntentScoringService } from './keyword-intelligence/intent-scoring.service';
import { SemanticExpansionService } from './keyword-intelligence/semantic-expansion.service';
import { InternalLinkingService } from './internal-linking.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { TopicalClusterService } from './topical-cluster.service';
import { OriginalityCheckerService } from './originality-checker.service';
import { KeywordResearchModule } from '../keyword-research/keyword-research.module';

@Module({
  imports: [KeywordResearchModule],
  providers: [
    KeywordIntentClassifierService,
    ContentScoringService,
    ContentPolicyEngineService,
    SemanticExpansionService,
    IntentScoringService,
    ClusterBuilderService,
    ContentCoverageEngineService,
    InternalLinkingService,
    KnowledgeBaseService,
    TopicalClusterService,
    OriginalityCheckerService,
  ],
  exports: [
    KeywordIntentClassifierService,
    ContentScoringService,
    ContentPolicyEngineService,
    SemanticExpansionService,
    IntentScoringService,
    ClusterBuilderService,
    ContentCoverageEngineService,
    InternalLinkingService,
    KnowledgeBaseService,
    TopicalClusterService,
    OriginalityCheckerService,
  ],
})
export class IntelligenceModule {}
