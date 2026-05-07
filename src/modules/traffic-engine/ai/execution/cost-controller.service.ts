import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { RedisService } from '../../../../common/redis/redis.service';
import { SiteConfigService } from '../../config/site-config.service';
import { BudgetAction } from '../types/ai-execution.types';

@Injectable()
export class CostControllerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly siteConfigService: SiteConfigService,
  ) {}

  async checkBudget(siteId: string): Promise<boolean> {
    const budget = await this.getBudgetSnapshot(siteId);
    return budget.spent < budget.limit;
  }

  async getDowngradeAction(siteId: string): Promise<BudgetAction> {
    const budget = await this.getBudgetSnapshot(siteId);
    if (budget.limit <= 0) {
      return 'skip_analysis';
    }
    const ratio = budget.spent / budget.limit;
    if (ratio >= 1) {
      return 'skip_analysis';
    }
    if (ratio >= 0.9) {
      return 'downgrade_model';
    }
    if (ratio >= 0.8) {
      return 'reduce_tokens';
    }
    return null;
  }

  async recordCost(siteId: string, tokens: number, cost: number): Promise<void> {
    const date = this.todayUtcDate();
    const ledger = await this.prisma.costLedger.upsert({
      where: { siteId_date: { siteId, date } },
      create: {
        siteId,
        date,
        totalCost: new Prisma.Decimal(cost),
        totalTokens: tokens,
        requestCount: 1,
      },
      update: {
        totalCost: { increment: new Prisma.Decimal(cost) },
        totalTokens: { increment: tokens },
        requestCount: { increment: 1 },
      },
    });
    const cacheKey = this.getDailyCacheKey(siteId, date);
    await this.redis.client.set(cacheKey, ledger.totalCost.toString());
    await this.redis.client.expire(cacheKey, this.secondsUntilMidnightUtc());
  }

  private async getBudgetSnapshot(siteId: string): Promise<{ limit: number; spent: number }> {
    const siteConfig = await this.siteConfigService.getForSite(siteId);
    const limit = siteConfig.aiBudgetLimit;
    const date = this.todayUtcDate();
    const cacheKey = this.getDailyCacheKey(siteId, date);
    const cached = await this.redis.client.get(cacheKey);
    if (cached !== null) {
      return { limit, spent: Number(cached) };
    }

    const ledger = await this.prisma.costLedger.findUnique({
      where: { siteId_date: { siteId, date } },
      select: { totalCost: true },
    });
    const spent = ledger ? Number(ledger.totalCost) : 0;
    await this.redis.client.set(cacheKey, String(spent));
    await this.redis.client.expire(cacheKey, this.secondsUntilMidnightUtc());
    return { limit, spent };
  }

  private todayUtcDate(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private getDailyCacheKey(siteId: string, date: Date): string {
    return `cost:daily:${siteId}:${date.toISOString().slice(0, 10)}`;
  }

  private secondsUntilMidnightUtc(): number {
    const now = new Date();
    const nextMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    return Math.max(1, Math.floor((nextMidnight.getTime() - now.getTime()) / 1000));
  }
}
