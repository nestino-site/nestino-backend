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

@Module({
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
  ],
})
export class IntelligenceModule {}
