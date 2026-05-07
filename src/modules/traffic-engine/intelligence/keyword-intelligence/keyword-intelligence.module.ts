import { Module } from '@nestjs/common';
import { KeywordIntentClassifierService } from '../keyword-intent-classifier.service';
import { ClusterBuilderService } from './cluster-builder.service';
import { ContentCoverageEngineService } from './content-coverage-engine.service';
import { IntentScoringService } from './intent-scoring.service';
import { SemanticExpansionService } from './semantic-expansion.service';

@Module({
  providers: [
    KeywordIntentClassifierService,
    SemanticExpansionService,
    IntentScoringService,
    ClusterBuilderService,
    ContentCoverageEngineService,
  ],
  exports: [
    SemanticExpansionService,
    IntentScoringService,
    ClusterBuilderService,
    ContentCoverageEngineService,
  ],
})
export class KeywordIntelligenceModule {}
