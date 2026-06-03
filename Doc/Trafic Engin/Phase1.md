# Nestino SEO & Traffic Engine — Phase 1: Foundation

## Overview

Build the database schema and NestJS module structure that all subsequent phases depend on. This phase produces zero user-facing features — it is purely infrastructure.

**Stack:**
- NestJS (Backend API + Workers)
- PostgreSQL + Prisma ORM
- Redis + BullMQ (Queue)
- Vercel (Next.js Frontend — not touched in this phase)
- Render or Railway (NestJS host)

---

## 1. Repository Structure

nestino-engine/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── common/
│   │   ├── prisma/
│   │   │   ├── prisma.module.ts
│   │   │   └── prisma.service.ts
│   │   └── redis/
│   │       ├── redis.module.ts
│   │       └── redis.service.ts
│   ├── sites/
│   │   ├── sites.module.ts
│   │   ├── sites.service.ts
│   │   ├── sites.controller.ts
│   │   └── dto/
│   │       ├── create-site.dto.ts
│   │       └── update-site.dto.ts
│   ├── keywords/
│   │   ├── keywords.module.ts
│   │   ├── keywords.service.ts
│   │   ├── keywords.controller.ts
│   │   └── dto/
│   │       ├── create-keyword.dto.ts
│   │       └── update-keyword.dto.ts
│   ├── pages/
│   │   ├── pages.module.ts
│   │   ├── pages.service.ts
│   │   ├── pages.controller.ts
│   │   └── dto/
│   │       ├── create-page.dto.ts
│   │       └── update-page.dto.ts
│   ├── content-tasks/
│   │   ├── content-tasks.module.ts
│   │   ├── content-tasks.service.ts
│   │   ├── content-tasks.controller.ts
│   │   ├── content-tasks.processor.ts
│   │   └── dto/
│   │       └── create-content-task.dto.ts
│   ├── seo-metrics/
│   │   ├── seo-metrics.module.ts
│   │   ├── seo-metrics.service.ts
│   │   └── seo-metrics.controller.ts
│   └── queue/
│       ├── queue.module.ts
│       └── queue.constants.ts
├── .env.example
├── package.json
└── tsconfig.json


---

## 2. Environment Variables

```env
# .env.example

DATABASE_URL="postgresql://user:password@host:5432/nestino_engine"

REDIS_URL="redis://localhost:6379"
# or Upstash:
# REDIS_URL="rediss://default:password@host.upstash.io:6379"

NODE_ENV="development"
PORT=3001

# AI Keys (not used in Phase 1, declare now)
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
GOOGLE_AI_API_KEY=""
```

---

## 3. Database Schema

### 3.1 Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────

enum SiteStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}

enum KeywordIntent {
  INFORMATIONAL
  NAVIGATIONAL
  TRANSACTIONAL
  COMMERCIAL
}

enum KeywordStatus {
  PENDING
  IN_PROGRESS
  PUBLISHED
  FAILED
  SKIPPED
}

enum PageStatus {
  DRAFT
  PUBLISHED
  NEEDS_UPDATE
  ARCHIVED
}

enum TaskStatus {
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
  CANCELLED
}

enum TaskType {
  GENERATE_CONTENT
  REWRITE_CONTENT
  GENERATE_META
  GENERATE_SCHEMA
  GENERATE_IMAGE
}

// ─────────────────────────────────────────
// MODELS
// ─────────────────────────────────────────

model Site {
  id          String     @id @default(cuid())
  name        String
  domain      String     @unique
  locale      String     @default("en")
  timezone    String     @default("UTC")
  status      SiteStatus @default(ACTIVE)
  config      Json?      // flexible per-site config blob
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  keywords    Keyword[]
  pages       Page[]
  seoMetrics  SeoMetric[]

  @@index([domain])
  @@map("sites")
}

model Keyword {
  id            String        @id @default(cuid())
  siteId        String
  phrase        String
  locale        String        @default("en")
  intent        KeywordIntent @default(INFORMATIONAL)
  status        KeywordStatus @default(PENDING)
  searchVolume  Int?
  difficulty    Float?        // 0-100
  cpc           Float?        // cost per click in USD
  priority      Int           @default(0) // higher = more important
  targetUrl     String?       // desired slug
  notes         String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  site          Site          @relation(fields: [siteId], references: [id], onDelete: Cascade)
  pages         Page[]
  contentTasks  ContentTask[]

  @@unique([siteId, phrase, locale])
  @@index([siteId, status])
  @@index([siteId, priority])
  @@map("keywords")
}

model Page {
  id              String     @id @default(cuid())
  siteId          String
  keywordId       String?
  slug            String
  locale          String     @default("en")
  title           String?
  metaDescription String?
  content         String?    @db.Text
  schemaMarkup    Json?      // JSON-LD blobs
  status          PageStatus @default(DRAFT)
  wordCount       Int?
  publishedAt     DateTime?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  site            Site          @relation(fields: [siteId], references: [id], onDelete: Cascade)
  keyword         Keyword?      @relation(fields: [keywordId], references: [id], onDelete: SetNull)
  contentTasks    ContentTask[]
  seoMetrics      SeoMetric[]

  @@unique([siteId, slug, locale])
  @@index([siteId, status])
  @@index([siteId, publishedAt])
  @@map("pages")
}

model ContentTask {
  id          String     @id @default(cuid())
  siteId      String?
  keywordId   String?
  pageId      String?
  type        TaskType   @default(GENERATE_CONTENT)
  status      TaskStatus @default(QUEUED)
  priority    Int        @default(0)
  payload     Json?      // input data for the AI job
  result      Json?      // AI output stored here
  errorLog    String?    @db.Text
  attempts    Int        @default(0)
  maxAttempts Int        @default(3)
  scheduledAt DateTime?
  startedAt   DateTime?
  completedAt DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  keyword     Keyword?   @relation(fields: [keywordId], references: [id], onDelete: SetNull)
  page        Page?      @relation(fields: [pageId], references: [id], onDelete: SetNull)

  @@index([status, scheduledAt])
  @@index([keywordId])
  @@index([pageId])
  @@map("content_tasks")
}

model SeoMetric {
  id              String   @id @default(cuid())
  siteId          String
  pageId          String?
  date            DateTime @db.Date
  impressions     Int      @default(0)
  clicks          Int      @default(0)
  ctr             Float    @default(0)
  avgPosition     Float?
  organicSessions Int      @default(0)
  bounceRate      Float?
  createdAt       DateTime @default(now())

  site            Site     @relation(fields: [siteId], references: [id], onDelete: Cascade)
  page            Page?    @relation(fields: [pageId], references: [id], onDelete: SetNull)

  @@unique([siteId, pageId, date])
  @@index([siteId, date])
  @@index([pageId, date])
  @@map("seo_metrics")
}
```

---

## 4. NestJS Implementation

### 4.1 package.json dependencies

```json
{
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "@nestjs/config": "^3.0.0",
    "@nestjs/bull": "^10.0.0",
    "@prisma/client": "^5.0.0",
    "bull": "^4.12.0",
    "bullmq": "^5.0.0",
    "ioredis": "^5.3.0",
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.0.0",
    "@types/node": "^20.0.0",
    "prisma": "^5.0.0",
    "typescript": "^5.0.0"
  }
}
```

### 4.2 main.ts

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1');
  app.enableCors();

  await app.listen(process.env.PORT ?? 3001);
  console.log(`Nestino Engine running on port ${process.env.PORT ?? 3001}`);
}

bootstrap();
```

### 4.3 app.module.ts

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { SitesModule } from './sites/sites.module';
import { KeywordsModule } from './keywords/keywords.module';
import { PagesModule } from './pages/pages.module';
import { ContentTasksModule } from './content-tasks/content-tasks.module';
import { SeoMetricsModule } from './seo-metrics/seo-metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    QueueModule,
    SitesModule,
    KeywordsModule,
    PagesModule,
    ContentTasksModule,
    SeoMetricsModule,
  ],
})
export class AppModule {}
```

### 4.4 Prisma Module & Service

```typescript
// src/common/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

```typescript
// src/common/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

### 4.5 Redis Module & Service

```typescript
// src/common/redis/redis.module.ts
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

```typescript
// src/common/redis/redis.service.ts
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // required for BullMQ
      enableReadyCheck: false,
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error('Redis error', err));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
```

### 4.6 Queue Module & Constants

```typescript
// src/queue/queue.constants.ts
export const QUEUES = {
  CONTENT_GENERATION: 'content-generation-queue',
  // Phase 2 queues (declared now, implemented later)
  ANALYTICS_SYNC: 'analytics-sync-queue',
  EVALUATION: 'evaluation-queue',
  AB_TEST: 'ab-test-queue',
  INTERNAL_LINK: 'internal-link-queue',
  // Phase 3 queues
  TREND_INGESTION: 'trend-ingestion-queue',
  TRANSLATION: 'translation-queue',
  AI_CITATION_CHECK: 'ai-citation-check-queue',
  GEO_SCHEMA: 'geo-schema-queue',
  // Phase 4 queues
  VISUAL_GENERATION: 'visual-generation-queue',
  INDEXING: 'indexing-queue',
  SOCIAL_SYNDICATION: 'social-syndication-queue',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
```

```typescript
// src/queue/queue.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUES } from './queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: process.env.REDIS_URL ?? 'redis://localhost:6379',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      }),
    }),
    BullModule.registerQueue(
      ...Object.values(QUEUES).map((name) => ({ name })),
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
```

### 4.7 Sites Module

```typescript
// src/sites/dto/create-site.dto.ts
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { SiteStatus } from '@prisma/client';

export class CreateSiteDto {
  @IsString()
  name: string;

  @IsString()
  domain: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsEnum(SiteStatus)
  status?: SiteStatus;
}
```

```typescript
// src/sites/sites.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateSiteDto) {
    return this.prisma.site.create({ data: dto });
  }

  findAll() {
    return this.prisma.site.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const site = await this.prisma.site.findUnique({ where: { id } });
    if (!site) throw new NotFoundException(`Site ${id} not found`);
    return site;
  }

  async update(id: string, dto: UpdateSiteDto) {
    await this.findOne(id);
    return this.prisma.site.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.site.delete({ where: { id } });
  }
}
```

```typescript
// src/sites/sites.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { SitesService } from './sites.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Controller('sites')
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Post()
  create(@Body() dto: CreateSiteDto) {
    return this.sitesService.create(dto);
  }

  @Get()
  findAll() {
    return this.sitesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sitesService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSiteDto) {
    return this.sitesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sitesService.remove(id);
  }
}
```

```typescript
// src/sites/sites.module.ts
import { Module } from '@nestjs/common';
import { SitesService } from './sites.service';
import { SitesController } from './sites.controller';

@Module({
  controllers: [SitesController],
  providers: [SitesService],
  exports: [SitesService],
})
export class SitesModule {}
```

### 4.8 Keywords Module

```typescript
// src/keywords/dto/create-keyword.dto.ts
import {
  IsString, IsOptional, IsEnum, IsInt,
  IsNumber, Min, Max,
} from 'class-validator';
import { KeywordIntent, KeywordStatus } from '@prisma/client';

export class CreateKeywordDto {
  @IsString()
  siteId: string;

  @IsString()
  phrase: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsEnum(KeywordIntent)
  intent?: KeywordIntent;

  @IsOptional()
  @IsEnum(KeywordStatus)
  status?: KeywordStatus;

  @IsOptional()
  @IsInt()
  searchVolume?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  difficulty?: number;

  @IsOptional()
  @IsNumber()
  cpc?: number;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  targetUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
```

```typescript
// src/keywords/keywords.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateKeywordDto } from './dto/create-keyword.dto';
import { UpdateKeywordDto } from './dto/update-keyword.dto';
import { KeywordStatus } from '@prisma/client';

@Injectable()
export class KeywordsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateKeywordDto) {
    return this.prisma.keyword.create({ data: dto });
  }

  createMany(dtos: CreateKeywordDto[]) {
    return this.prisma.keyword.createMany({ data: dtos, skipDuplicates: true });
  }

  findBySite(siteId: string) {
    return this.prisma.keyword.findMany({
      where: { siteId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  findPending(siteId: string) {
    return this.prisma.keyword.findMany({
      where: { siteId, status: KeywordStatus.PENDING },
      orderBy: { priority: 'desc' },
    });
  }

  async findOne(id: string) {
    const kw = await this.prisma.keyword.findUnique({ where: { id } });
    if (!kw) throw new NotFoundException(`Keyword ${id} not found`);
    return kw;
  }

  async update(id: string, dto: UpdateKeywordDto) {
    await this.findOne(id);
    return this.prisma.keyword.update({ where: { id }, data: dto });
  }

  async updateStatus(id: string, status: KeywordStatus) {
    return this.prisma.keyword.update({ where: { id }, data: { status } });
  }
}
```

```typescript
// src/keywords/keywords.controller.ts
import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { KeywordsService } from './keywords.service';
import { CreateKeywordDto } from './dto/create-keyword.dto';
import { UpdateKeywordDto } from './dto/update-keyword.dto';

@Controller('keywords')
export class KeywordsController {
  constructor(private readonly keywordsService: KeywordsService) {}

  @Post()
  create(@Body() dto: CreateKeywordDto) {
    return this.keywordsService.create(dto);
  }

  @Post('bulk')
  createMany(@Body() dtos: CreateKeywordDto[]) {
    return this.keywordsService.createMany(dtos);
  }

  @Get()
  findBySite(@Query('siteId') siteId: string) {
    return this.keywordsService.findBySite(siteId);
  }

  @Get('pending')
  findPending(@Query('siteId') siteId: string) {
    return this.keywordsService.findPending(siteId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.keywordsService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateKeywordDto) {
    return this.keywordsService.update(id, dto);
  }
}
```

```typescript
// src/keywords/keywords.module.ts
import { Module } from '@nestjs/common';
import { KeywordsService } from './keywords.service';
import { KeywordsController } from './keywords.controller';

@Module({
  controllers: [KeywordsController],
  providers: [KeywordsService],
  exports: [KeywordsService],
})
export class KeywordsModule {}
```

### 4.9 Pages Module

```typescript
// src/pages/dto/create-page.dto.ts
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { PageStatus } from '@prisma/client';

export class CreatePageDto {
  @IsString()
  siteId: string;

  @IsOptional()
  @IsString()
  keywordId?: string;

  @IsString()
  slug: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(PageStatus)
  status?: PageStatus;
}
```

```typescript
// src/pages/pages.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { PageStatus } from '@prisma/client';

@Injectable()
export class PagesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreatePageDto) {
    return this.prisma.page.create({ data: dto });
  }

  findBySite(siteId: string, status?: PageStatus) {
    return this.prisma.page.findMany({
      where: { siteId, ...(status && { status }) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const page = await this.prisma.page.findUnique({
      where: { id },
      include: { keyword: true, seoMetrics: { take: 30, orderBy: { date: 'desc' } } },
    });
    if (!page) throw new NotFoundException(`Page ${id} not found`);
    return page;
  }

  async update(id: string, dto: UpdatePageDto) {
    await this.findOne(id);
    return this.prisma.page.update({ where: { id }, data: dto });
  }

  async publish(id: string) {
    return this.prisma.page.update({
      where: { id },
      data: { status: PageStatus.PUBLISHED, publishedAt: new Date() },
    });
  }
}
```

```typescript
// src/pages/pages.controller.ts
import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { PagesService } from './pages.service';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { PageStatus } from '@prisma/client';

@Controller('pages')
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Post()
  create(@Body() dto: CreatePageDto) {
    return this.pagesService.create(dto);
  }

  @Get()
  findBySite(
    @Query('siteId') siteId: string,
    @Query('status') status?: PageStatus,
  ) {
    return this.pagesService.findBySite(siteId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pagesService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePageDto) {
    return this.pagesService.update(id, dto);
  }

  @Put(':id/publish')
  publish(@Param('id') id: string) {
    return this.pagesService.publish(id);
  }
}
```

```typescript
// src/pages/pages.module.ts
import { Module } from '@nestjs/common';
import { PagesService } from './pages.service';
import { PagesController } from './pages.controller';

@Module({
  controllers: [PagesController],
  providers: [PagesService],
  exports: [PagesService],
})
export class PagesModule {}
```

### 4.10 Content Tasks Module (continued)

```typescript
  async markCompleted(id: string, result: Record<string, unknown>) {
    return this.prisma.contentTask.update({
      where: { id },
      data: {
        status: TaskStatus.COMPLETED,
        result,
        completedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  }

  async markProcessing(id: string) {
    return this.prisma.contentTask.update({
      where: { id },
      data: {
        status: TaskStatus.PROCESSING,
        startedAt: new Date(),
      },
    });
  }
}
```

```typescript
// src/content-tasks/content-tasks.processor.ts
import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUES } from '../queue/queue.constants';
import { ContentTasksService } from './content-tasks.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Processor(QUEUES.CONTENT_GENERATION)
export class ContentTasksProcessor {
  private readonly logger = new Logger(ContentTasksProcessor.name);

  constructor(
    private readonly tasksService: ContentTasksService,
    private readonly prisma: PrismaService,
  ) {}

  @Process('process-content-task')
  async handle(job: Job<{ taskId: string }>) {
    const { taskId } = job.data;
    this.logger.log(`Processing task ${taskId}`);

    const task = await this.tasksService.findOne(taskId);

    // guard: skip if already completed or cancelled
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return;

    // check max attempts
    if (task.attempts >= task.maxAttempts) {
      await this.tasksService.markFailed(taskId, 'Max attempts reached');
      return;
    }

    await this.tasksService.markProcessing(taskId);

    try {
      // Phase 1: stub — actual AI call implemented in Phase 2+
      const result = await this.processTask(task);
      await this.tasksService.markCompleted(taskId, result);
      this.logger.log(`Task ${taskId} completed`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.tasksService.markFailed(taskId, message);
      this.logger.error(`Task ${taskId} failed: ${message}`);
      throw err; // re-throw so BullMQ retries
    }
  }

  private async processTask(task: any): Promise<Record<string, unknown>> {
    // Phase 1 stub — returns mock result
    // Phase 2 will replace this with real AI calls
    this.logger.log(`Task type: ${task.type}, payload: ${JSON.stringify(task.payload)}`);
    return { stub: true, type: task.type, processedAt: new Date().toISOString() };
  }
}
```

```typescript
// src/content-tasks/content-tasks.controller.ts
import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ContentTasksService } from './content-tasks.service';
import { CreateContentTaskDto } from './dto/create-content-task.dto';

@Controller('content-tasks')
export class ContentTasksController {
  constructor(private readonly contentTasksService: ContentTasksService) {}

  @Post()
  create(@Body() dto: CreateContentTaskDto) {
    return this.contentTasksService.create(dto);
  }

  @Get()
  findAll(@Query('siteId') siteId?: string) {
    return this.contentTasksService.findAll(siteId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contentTasksService.findOne(id);
  }
}
```

```typescript
// src/content-tasks/content-tasks.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ContentTasksService } from './content-tasks.service';
import { ContentTasksController } from './content-tasks.controller';
import { ContentTasksProcessor } from './content-tasks.processor';
import { QUEUES } from '../queue/queue.constants';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.CONTENT_GENERATION })],
  controllers: [ContentTasksController],
  providers: [ContentTasksService, ContentTasksProcessor],
  exports: [ContentTasksService],
})
export class ContentTasksModule {}
```

---

### 4.11 SEO Metrics Module

```typescript
// src/seo-metrics/seo-metrics.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

export interface UpsertMetricDto {
  siteId: string;
  pageId?: string;
  date: Date;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  avgPosition?: number;
  organicSessions?: number;
  bounceRate?: number;
}

@Injectable()
export class SeoMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  upsert(dto: UpsertMetricDto) {
    const { siteId, pageId, date, ...data } = dto;
    return this.prisma.seoMetric.upsert({
      where: { siteId_pageId_date: { siteId, pageId: pageId ?? null, date } },
      create: { siteId, pageId, date, ...data },
      update: data,
    });
  }

  upsertMany(dtos: UpsertMetricDto[]) {
    return Promise.all(dtos.map((dto) => this.upsert(dto)));
  }

  findBySite(siteId: string, days = 30) {
    const from = new Date();
    from.setDate(from.getDate() - days);
    return this.prisma.seoMetric.findMany({
      where: { siteId, date: { gte: from } },
      orderBy: { date: 'desc' },
    });
  }

  findByPage(pageId: string, days = 30) {
    const from = new Date();
    from.setDate(from.getDate() - days);
    return this.prisma.seoMetric.findMany({
      where: { pageId, date: { gte: from } },
      orderBy: { date: 'desc' },
    });
  }

  // aggregate CTR and avg position per page for evaluation (used in Phase 2)
  async getPageSummary(siteId: string) {
    return this.prisma.seoMetric.groupBy({
      by: ['pageId'],
      where: { siteId },
      _avg: { ctr: true, avgPosition: true },
      _sum: { clicks: true, impressions: true },
    });
  }
}
```

```typescript
// src/seo-metrics/seo-metrics.controller.ts
import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { SeoMetricsService, UpsertMetricDto } from './seo-metrics.service';

@Controller('seo-metrics')
export class SeoMetricsController {
  constructor(private readonly seoMetricsService: SeoMetricsService) {}

  @Post()
  upsert(@Body() dto: UpsertMetricDto) {
    return this.seoMetricsService.upsert(dto);
  }

  @Post('bulk')
  upsertMany(@Body() dtos: UpsertMetricDto[]) {
    return this.seoMetricsService.upsertMany(dtos);
  }

  @Get()
  findBySite(
    @Query('siteId') siteId: string,
    @Query('days') days?: string,
  ) {
    return this.seoMetricsService.findBySite(siteId, days ? parseInt(days) : 30);
  }

  @Get('summary')
  getPageSummary(@Query('siteId') siteId: string) {
    return this.seoMetricsService.getPageSummary(siteId);
  }
}
```

```typescript
// src/seo-metrics/seo-metrics.module.ts
import { Module } from '@nestjs/common';
import { SeoMetricsService } from './seo-metrics.service';
import { SeoMetricsController } from './seo-metrics.controller';

@Module({
  controllers: [SeoMetricsController],
  providers: [SeoMetricsService],
  exports: [SeoMetricsService],
})
export class SeoMetricsModule {}
```

---

## 5. Setup & Migration Commands

Run these in order after cloning the repo:

```bash
# 1. install dependencies
npm install

# 2. copy env and fill in values
cp .env.example .env

# 3. generate prisma client
npx prisma generate

# 4. run migrations (creates all tables)
npx prisma migrate dev --name phase1_foundation

# 5. (optional) open prisma studio to verify tables
npx prisma studio

# 6. start dev server
npm run start:dev
```

---

## 6. Verification Checklist

After setup, confirm the following before moving to Phase 2:

[ ] All 5 tables exist in PostgreSQL:
    - sites
    - keywords
    - pages
    - content_tasks
    - seo_metrics

[ ] Redis connection is healthy (check logs on startup)

[ ] BullMQ queue "content-generation-queue" is registered

[ ] All queue names in queue.constants.ts match Phase 2-4 plan

[ ] POST /api/v1/sites creates a site record
[ ] POST /api/v1/keywords creates a keyword linked to site
[ ] POST /api/v1/pages creates a page linked to site + keyword
[ ] POST /api/v1/content-tasks creates a task and enqueues it
[ ] Task processor picks up the job and marks it COMPLETED (stub)
[ ] GET /api/v1/seo-metrics?siteId=xxx returns empty array (no data yet)


---

## 7. What Phase 2 Builds On Top

Phase 1 intentionally leaves these as stubs:

| Stub | Phase 2 Implementation |
|---|---|
| `processTask()` in processor | Real AI calls (OpenAI / Anthropic) |
| `SeoMetric` upsert | GSC/GA4 ingestion pipeline |
| `config` JSON on Site | Per-site AI model preferences |
| `payload` on ContentTask | Structured SEO brief passed to LLM |
| Queue names declared but unused | Analytics, evaluation, A/B test workers |

---

**Phase 1 is complete when the verification checklist passes. Do not proceed to Phase 2 until all items are green.**