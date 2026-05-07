import { Injectable } from '@nestjs/common';
import { KeywordIntent } from '@prisma/client';
import { KeywordIntentClassifierService } from '../keyword-intent-classifier.service';

@Injectable()
export class IntentScoringService {
  constructor(private readonly intentClassifier: KeywordIntentClassifierService) {}

  async scoreIntent(primaryKeyword: string, language: string, content: string): Promise<number> {
    const intent = await this.intentClassifier.classify(primaryKeyword, language);
    return this.computeAlignmentScore(content.toLowerCase(), intent);
  }

  private computeAlignmentScore(content: string, intent: KeywordIntent): number {
    const signals = this.getIntentSignals(intent);
    const matched = signals.filter((signal) => content.includes(signal)).length;
    if (signals.length === 0) return 0.6;
    const ratio = matched / signals.length;
    return Number(Math.max(0.2, Math.min(1, 0.4 + ratio * 0.6)).toFixed(2));
  }

  private getIntentSignals(intent: KeywordIntent): string[] {
    switch (intent) {
      case KeywordIntent.TRANSACTIONAL:
        return ['book', 'buy', 'order', 'price', 'contact', 'reserve', 'purchase', 'checkout'];
      case KeywordIntent.COMMERCIAL:
        return ['best', 'top', 'compare', 'review', 'vs', 'recommend', 'rating'];
      case KeywordIntent.NAVIGATIONAL:
        return ['official', 'website', 'location', 'address', 'contact', 'homepage'];
      case KeywordIntent.INFORMATIONAL:
      default:
        return ['guide', 'how', 'what', 'why', 'learn', 'explain', 'understand'];
    }
  }
}
