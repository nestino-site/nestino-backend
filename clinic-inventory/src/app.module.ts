import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './common/guards/auth.module';
import { GeoModule } from './modules/geo/geo.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ClinicsModule } from './modules/clinics/clinics.module';
import { MediaModule } from './modules/media/media.module';
import { InterviewsModule } from './modules/interviews/interviews.module';
import { TruthScoreModule } from './modules/truth-score/truth-score.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { PublishingModule } from './modules/publishing/publishing.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuthModule,
    GeoModule,
    CatalogModule,
    ClinicsModule,
    MediaModule,
    InterviewsModule,
    TruthScoreModule,
    DiscoveryModule,
    PublishingModule,
  ],
})
export class AppModule {}
