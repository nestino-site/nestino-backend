import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { InfrastructureQueueModule } from './infrastructure/queue/infrastructure-queue.module';
import { IdentityModule } from './modules/identity/identity.module';
import { TrafficEngineModule } from './modules/traffic-engine/traffic-engine.module';
import { ClinicInventoryModule } from './modules/clinic-inventory/clinic-inventory.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Global rate-limit: 120 requests per minute per IP across all public endpoints.
    // The clinic photo proxy (/clinics/:id/photo) overrides this with a tighter limit via @Throttle().
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    IdentityModule,
    InfrastructureQueueModule,
    TrafficEngineModule,
    ClinicInventoryModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
