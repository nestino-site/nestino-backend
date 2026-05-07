import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { InfrastructureQueueModule } from './infrastructure/queue/infrastructure-queue.module';
import { TrafficEngineModule } from './modules/traffic-engine/traffic-engine.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    InfrastructureQueueModule,
    TrafficEngineModule,
  ],
})
export class AppModule {}
