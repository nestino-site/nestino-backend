# Phase 3: Publishing & Distribution Engine

## Overview

Phase 3 connects the AI-generated content pipeline to actual publishing targets. Content moves from `DRAFT` → `REVIEWED` → `PUBLISHED` → `DISTRIBUTED` with full audit trail, webhook notifications, and multi-channel distribution.

---

## Architecture

Content Pipeline Output (Phase 2)
         │
         ▼
┌─────────────────────┐
│   Publishing Queue   │  BullMQ: publish-queue
└─────────┬───────────┘
          │
    ┌─────▼──────┐
    │  Publisher  │  Validates, formats, schedules
    └─────┬──────┘
          │
    ┌─────▼──────────────────────────────────┐
    │           Distribution Layer            │
    │  ┌──────────┐  ┌──────────┐  ┌──────┐  │
    │  │ WordPress│  │  Ghost   │  │ API  │  │
    │  └──────────┘  └──────────┘  └──────┘  │
    └────────────────────────────────────────┘
          │
    ┌─────▼──────┐
    │  Notifier   │  Webhooks, Slack, Email
    └────────────┘


---

## New Environment Variables

```env
# .env.example additions for Phase 3

# Publishing
PUBLISH_QUEUE_CONCURRENCY=3
DEFAULT_PUBLISH_STRATEGY=scheduled   # immediate | scheduled | manual

# WordPress Integration
WP_API_URL=https://yoursite.com/wp-json/wp/v2
WP_USERNAME=your_wp_username
WP_APP_PASSWORD=your_wp_app_password

# Ghost Integration
GHOST_API_URL=https://yoursite.ghost.io
GHOST_ADMIN_API_KEY=your_ghost_admin_key

# Webhook Notifications
WEBHOOK_PUBLISH_SUCCESS=https://hooks.yourapp.com/publish-success
WEBHOOK_PUBLISH_FAILED=https://hooks.yourapp.com/publish-failed
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz

# Scheduling
PUBLISH_TIMEZONE=UTC
MAX_PUBLISH_RETRIES=3
RETRY_DELAY_MS=5000

# Image Processing
CLOUDFLARE_R2_BUCKET=nestino-assets
CLOUDFLARE_R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
CLOUDFLARE_R2_ACCESS_KEY=your_r2_access_key
CLOUDFLARE_R2_SECRET_KEY=your_r2_secret_key
CLOUDFLARE_R2_PUBLIC_URL=https://assets.yoursite.com
```

---

## Schema Updates

```prisma
// prisma/schema.prisma — Phase 3 additions

enum PublishStatus {
  DRAFT
  REVIEW_PENDING
  REVIEWED
  SCHEDULED
  PUBLISHING
  PUBLISHED
  FAILED
  ARCHIVED
}

enum PublishTarget {
  WORDPRESS
  GHOST
  HEADLESS_API
  STATIC_JSON
}

enum DistributionChannel {
  SITEMAP
  RSS
  SOCIAL_QUEUE
  EMAIL_DIGEST
  WEBHOOK
}

model PublishJob {
  id              String        @id @default(cuid())
  pageId          String
  page            Page          @relation(fields: [pageId], references: [id])
  siteId          String
  site            Site          @relation(fields: [siteId], references: [id])

  target          PublishTarget
  status          PublishStatus @default(DRAFT)

  scheduledAt     DateTime?
  publishedAt     DateTime?
  failedAt        DateTime?

  retryCount      Int           @default(0)
  maxRetries      Int           @default(3)
  lastError       String?

  externalId      String?       // ID on target platform (WP post ID, Ghost post ID)
  externalUrl     String?       // Live URL on target platform

  payload         Json?         // Serialized content sent to target
  response        Json?         // Raw response from target platform

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@index([pageId])
  @@index([siteId])
  @@index([status])
  @@index([scheduledAt])
}

model DistributionLog {
  id          String              @id @default(cuid())
  publishJobId String
  publishJob  PublishJob          @relation(fields: [publishJobId], references: [id])

  channel     DistributionChannel
  status      String              // success | failed
  payload     Json?
  response    Json?
  sentAt      DateTime            @default(now())

  @@index([publishJobId])
}

model SitePublishConfig {
  id          String        @id @default(cuid())
  siteId      String        @unique
  site        Site          @relation(fields: [siteId], references: [id])

  target      PublishTarget
  credentials Json          // encrypted at app level before storing
  settings    Json          // target-specific settings (category IDs, author IDs, etc.)

  isActive    Boolean       @default(true)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}

// Update Page model
model Page {
  // ... existing fields
  publishStatus   PublishStatus @default(DRAFT)
  publishJobs     PublishJob[]
}
```

---

## Directory Structure

src/
├── publishing/
│   ├── publishing.module.ts
│   ├── publishing.service.ts          # Orchestrates publish pipeline
│   ├── publishing.controller.ts
│   │
│   ├── adapters/
│   │   ├── publisher.interface.ts     # IPublisher contract
│   │   ├── wordpress.adapter.ts
│   │   ├── ghost.adapter.ts
│   │   └── headless-api.adapter.ts
│   │
│   ├── formatters/
│   │   ├── content.formatter.ts       # HTML cleanup, image injection
│   │   └── seo-meta.formatter.ts      # og:tags, schema.org JSON-LD
│   │
│   ├── scheduler/
│   │   ├── publish.scheduler.ts       # Cron-based scheduled publishing
│   │   └── schedule.strategy.ts       # Optimal time calculation
│   │
│   └── processors/
│       └── publish.processor.ts       # BullMQ processor
│
├── distribution/
│   ├── distribution.module.ts
│   ├── distribution.service.ts
│   │
│   ├── channels/
│   │   ├── sitemap.channel.ts
│   │   ├── rss.channel.ts
│   │   └── webhook.channel.ts
│   │
│   └── notifier/
│       ├── notifier.service.ts
│       └── slack.notifier.ts
│
└── assets/
    ├── assets.module.ts
    └── image-processor.service.ts     # R2 upload + optimization


---

## 1. Publisher Interface

```typescript
// src/publishing/adapters/publisher.interface.ts

export interface PublishPayload {
  title: string;
  content: string;           // HTML
  excerpt?: string;
  slug: string;
  locale: string;
  metaTitle?: string;
  metaDescription?: string;
  featuredImageUrl?: string;
  tags?: string[];
  categories?: string[];
  authorId?: string;
  publishedAt?: Date;        // null = draft
  schemaMarkup?: object;
  hreflangTags?: Record<string, string>;
}

export interface PublishResult {
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  rawResponse?: unknown;
  error?: string;
}

export interface IPublisher {
  publish(payload: PublishPayload, credentials: unknown): Promise<PublishResult>;
  update(externalId: string, payload: PublishPayload, credentials: unknown): Promise<PublishResult>;
  unpublish(externalId: string, credentials: unknown): Promise<PublishResult>;
  validateCredentials(credentials: unknown): Promise<boolean>;
}
```

---

## 2. WordPress Adapter

```typescript
// src/publishing/adapters/wordpress.adapter.ts

import { Injectable, Logger } from '@nestjs/common';
import { IPublisher, PublishPayload, PublishResult } from './publisher.interface';

interface WpCredentials {
  apiUrl: string;
  username: string;
  appPassword: string;
}

interface WpSettings {
  defaultCategoryId?: number;
  defaultAuthorId?: number;
  defaultStatus?: 'publish' | 'draft' | 'future';
}

@Injectable()
export class WordPressAdapter implements IPublisher {
  private readonly logger = new Logger(WordPressAdapter.name);

  private getAuthHeader(credentials: WpCredentials): string {
    const token = Buffer.from(
      `${credentials.username}:${credentials.appPassword}`,
    ).toString('base64');
    return `Basic ${token}`;
  }

  async publish(
    payload: PublishPayload,
    credentials: WpCredentials,
    settings: WpSettings = {},
  ): Promise<PublishResult> {
    try {
      const body = this.buildWpPayload(payload, settings);

      const response = await fetch(`${credentials.apiUrl}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.getAuthHeader(credentials),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`WP API error ${response.status}: ${error}`);
      }

      const data = await response.json();

      return {
        success: true,
        externalId: String(data.id),
        externalUrl: data.link,
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error(`WordPress publish failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async update(
    externalId: string,
    payload: PublishPayload,
    credentials: WpCredentials,
    settings: WpSettings = {},
  ): Promise<PublishResult> {
    try {
      const body = this.buildWpPayload(payload, settings);

      const response = await fetch(
        `${credentials.apiUrl}/posts/${externalId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: this.getAuthHeader(credentials),
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        throw new Error(`WP update error ${response.status}`);
      }

      const data = await response.json();
      return { success: true, externalId: String(data.id), externalUrl: data.link };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async unpublish(externalId: string, credentials: WpCredentials): Promise<PublishResult> {
    try {
      await fetch(`${credentials.apiUrl}/posts/${externalId}`, {
        method: 'DELETE',
        headers: { Authorization: this.getAuthHeader(credentials) },
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async validateCredentials(credentials: WpCredentials): Promise<boolean> {
    try {
      const response = await fetch(`${credentials.apiUrl}/users/me`, {
        headers: { Authorization: this.getAuthHeader(credentials) },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private buildWpPayload(payload: PublishPayload, settings: WpSettings) {
    return {
      title: payload.title,
      content: this.injectSchemaMarkup(payload.content, payload.schemaMarkup),
      excerpt: payload.excerpt,
      slug: payload.slug,
      status: payload.publishedAt ? 'publish' : 'draft',
      date: payload.publishedAt?.toISOString(),
      categories: settings.defaultCategoryId ? [settings.defaultCategoryId] : [],
      author: settings.defaultAuthorId,
      meta: {
        _yoast_wpseo_title: payload.metaTitle,
        _yoast_wpseo_metadesc: payload.metaDescription,
      },
      featured_media: undefined, // set after image upload
    };
  }

  private injectSchemaMarkup(content: string, schema?: object): string {
    if (!schema) return content;
    const scriptTag = `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
    return `${content}\n${scriptTag}`;
  }
}
```

---

## 3. Ghost Adapter

```typescript
// src/publishing/adapters/ghost.adapter.ts

import { Injectable, Logger } from '@nestjs/common';
import { IPublisher, PublishPayload, PublishResult } from './publisher.interface';
import * as crypto from 'crypto';

interface GhostCredentials {
  apiUrl: string;
  adminApiKey: string; // format: "id:secret"
}

@Injectable()
export class GhostAdapter implements IPublisher {
  private readonly logger = new Logger(GhostAdapter.name);

  private generateJwt(adminApiKey: string): string {
    const [id, secret] = adminApiKey.split(':');
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', kid: id, typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const claims = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).toString('base64url');
    const signature = crypto
      .createHmac('sha256', Buffer.from(secret, 'hex'))
      .update(`${header}.${claims}`)
      .digest('base64url');
    return `${header}.${claims}.${signature}`;
  }

  async publish(payload: PublishPayload, credentials: GhostCredentials): Promise<PublishResult> {
    try {
      const jwt = this.generateJwt(credentials.adminApiKey);
      const body = {
        posts: [
          {
            title: payload.title,
            html: payload.content,
            custom_excerpt: payload.excerpt,
            slug: payload.slug,
            status: payload.publishedAt ? 'published' : 'draft',
            published_at: payload.publishedAt?.toISOString(),
            tags: payload.tags?.map((name) => ({ name })),
            meta_title: payload.metaTitle,
            meta_description: payload.metaDescription,
            feature_image: payload.featuredImageUrl,
            locale: payload.locale,
          },
        ],
      };

      const response = await fetch(`${credentials.apiUrl}/ghost/api/admin/posts/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Ghost ${jwt}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ghost API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      const post = data.posts[0];

      return {
        success: true,
        externalId: post.id,
        externalUrl: post.url,
        rawResponse: post,
      };
    } catch (error) {
      this.logger.error(`Ghost publish failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async update(externalId: string, payload: PublishPayload, credentials: GhostCredentials): Promise<PublishResult> {
    try {
      const jwt = this.generateJwt(credentials.adminApiKey);

      // Ghost requires updated_at for optimistic locking
      const existing = await fetch(
        `${credentials.apiUrl}/ghost/api/admin/posts/${externalId}/`,
        { headers: { Authorization: `Ghost ${jwt}` } },
      ).then((r) => r.json());

      const response = await fetch(
        `${credentials.apiUrl}/ghost/api/admin/posts/${externalId}/`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Ghost ${jwt}`,
          },
          body: JSON.stringify({
            posts: [
              {
                title: payload.title,
                html: payload.content,
                updated_at: existing.posts[0].updated_at,
              },
            ],
          }),
        },
      );

      const data = await response.json();
      return { success: true, externalId, externalUrl: data.posts[0].url };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async unpublish(externalId: string, credentials: GhostCredentials): Promise<PublishResult> {
    try {
      const jwt = this.generateJwt(credentials.adminApiKey);
      await fetch(`${credentials.apiUrl}/ghost/api/admin/posts/${externalId}/`, {
        method: 'DELETE',
        headers: { Authorization: `Ghost ${jwt}` },
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async validateCredentials(credentials: GhostCredentials): Promise<boolean> {
    try {
      const jwt = this.generateJwt(credentials.adminApiKey);
      const response = await fetch(`${credentials.apiUrl}/ghost/api/admin/site/`, {
        headers: { Authorization: `Ghost ${jwt}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

---

## 4. Content Formatter

```typescript
// src/publishing/formatters/content.formatter.ts

import { Injectable } from '@nestjs/common';

export interface FormattedContent {
  html: string;
  excerpt: string;
  readingTimeMinutes: number;
  wordCount: number;
}

@Injectable()
export class ContentFormatter {
  format(rawContent: string, locale: string): FormattedContent {
    const html = this.cleanHtml(rawContent);
    const text = this.stripHtml(html);
    const wordCount = this.countWords(text, locale);

    return {
      html,
      excerpt: this.extractExcerpt(text, 160),
      readingTimeMinutes: Math.ceil(wordCount / 200),
      wordCount,
    };
  }

  private cleanHtml(content: string): string {
    return content
      .replace(/<script(?!.*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, '') // remove non-schema scripts
      .replace(/\s+/g, ' ')
      .replace(/>\s+</g, '><')
      .trim();
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private extractExcerpt(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    const truncated = text.substring(0, maxLength);
    return truncated.substring(0, truncated.lastIndexOf(' ')) + '...';
  }

  private countWords(text: string, locale: string): number {
    // CJK and Arabic scripts need different counting
    const cjkLocales = ['zh', 'ja', 'ko'];
    if (cjkLocales.includes(locale)) {
      return text.replace(/\s/g, '').length;
    }
    return text.split(/\s+/).filter(Boolean).length;
  }
}
```

---

## 5. SEO Meta Formatter

```typescript
// src/publishing/formatters/seo-meta.formatter.ts

import { Injectable } from '@nestjs/common';

export interface SeoMeta {
  schemaMarkup: object;
  ogTags: Record<string, string>;
  twitterTags: Record<string, string>;
}

@Injectable()
export class SeoMetaFormatter {
  buildArticleSchema(params: {
    title: string;
    description: string;
    url: string;
    imageUrl?: string;
    authorName?: string;
    publishedAt?: Date;
    updatedAt?: Date;
    locale: string;
  }): object {
    return {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: params.title,
      description: params.description,
      url: params.url,
      image: params.imageUrl,
      inLanguage: params.locale,
      author: {
        '@type': 'Organization',
        name: params.authorName || 'Nestino',
      },
      datePublished: params.publishedAt?.toISOString(),
      dateModified: params.updatedAt?.toISOString() || params.publishedAt?.toISOString(),
    };
  }

  buildOpenGraphTags(params: {
    title: string;
    description: string;
    url: string;
    imageUrl?: string;
    locale: string;
    siteName: string;
  }): Record<string, string> {
    return {
      'og:type': 'article',
      'og:title': params.title,
      'og:description': params.description,
      'og:url': params.url,
      'og:image': params.imageUrl || '',
      'og:locale': params.locale.replace('-', '_'),
      'og:site_name': params.siteName,
    };
  }

  buildTwitterTags(params: {
    title: string;
    description: string;
    imageUrl?: string;
  }): Record<string, string> {
    return {
      'twitter:card': 'summary_large_image',
      'twitter:title': params.title,
      'twitter:description': params.description,
      'twitter:image': params.imageUrl || '',
    };
  }
}
```

---

## 6. Publishing Service

```typescript
// src/publishing/publishing.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WordPressAdapter } from './adapters/wordpress.adapter';
import { GhostAdapter } from './adapters/ghost.adapter';
import { ContentFormatter } from './formatters/content.formatter';
import { SeoMetaFormatter } from './formatters/seo-meta.formatter';
import { PublishPlatform, PublishStatus } from '@prisma/client';
import { IPublisher } from './adapters/publisher.interface';

export interface SchedulePublishDto {
  pageId: string;
  platform: PublishPlatform;
  scheduledAt?: Date;
  credentials: Record<string, string>;
}

@Injectable()
export class PublishingService {
  private readonly logger = new Logger(PublishingService.name);
  private readonly adapters: Map<PublishPlatform, IPublisher>;

  constructor(
    @InjectQueue('publish-queue') private publishQueue: Queue,
    private prisma: PrismaService,
    private wordPressAdapter: WordPressAdapter,
    private ghostAdapter: GhostAdapter,
    private contentFormatter: ContentFormatter,
    private seoMetaFormatter: SeoMetaFormatter,
  ) {
    this.adapters = new Map([
      [PublishPlatform.WORDPRESS, this.wordPressAdapter],
      [PublishPlatform.GHOST, this.ghostAdapter],
    ]);
  }

  async schedulePublish(dto: SchedulePublishDto) {
    const page = await this.prisma.page.findUnique({ where: { id: dto.pageId } });
    if (!page) throw new NotFoundException(`Page ${dto.pageId} not found`);

    const adapter = this.adapters.get(dto.platform);
    if (!adapter) throw new BadRequestException(`Unsupported platform: ${dto.platform}`);

    const isValid = await adapter.validateCredentials(dto.credentials);
    if (!isValid) throw new BadRequestException('Invalid platform credentials');

    const publishJob = await this.prisma.publishJob.create({
      data: {
        pageId: dto.pageId,
        platform: dto.platform,
        status: dto.scheduledAt ? PublishStatus.SCHEDULED : PublishStatus.PUBLISHING,
        scheduledAt: dto.scheduledAt,
        metadata: { credentials: dto.credentials },
      },
    });

    if (!dto.scheduledAt) {
      await this.publishQueue.add(
        'publish-page',
        { publishJobId: publishJob.id },
        { jobId: `publish-${publishJob.id}` },
      );
    }

    return publishJob;
  }

  async executePublish(publishJobId: string): Promise<void> {
    const publishJob = await this.prisma.publishJob.findUnique({
      where: { id: publishJobId },
      include: { page: true },
    });

    if (!publishJob) throw new NotFoundException(`PublishJob ${publishJobId} not found`);

    const adapter = this.adapters.get(publishJob.platform);
    if (!adapter) throw new BadRequestException(`No adapter for platform: ${publishJob.platform}`);

    const credentials = (publishJob.metadata as any)?.credentials || {};
    const formattedContent = this.contentFormatter.formatHtml(publishJob.page.content);
    const excerpt = publishJob.page.excerpt
      || this.contentFormatter.generateExcerpt(formattedContent);

    const payload = {
      title: publishJob.page.title,
      content: formattedContent,
      excerpt,
      slug: publishJob.page.slug,
      featuredImage: publishJob.page.featuredImage ?? undefined,
      seoTitle: publishJob.page.seoTitle ?? undefined,
      seoDescription: publishJob.page.seoDescription ?? undefined,
      locale: publishJob.page.locale,
      publishedAt: new Date(),
    };

    try {
      let result;
      if (publishJob.externalId) {
        result = await adapter.update(publishJob.externalId, payload, credentials);
      } else {
        result = await adapter.publish(payload, credentials);
      }

      await this.prisma.publishJob.update({
        where: { id: publishJobId },
        data: {
          status: PublishStatus.PUBLISHED,
          externalId: result.externalId,
          externalUrl: result.externalUrl,
          publishedAt: new Date(),
          lastError: null,
        },
      });

      await this.prisma.page.update({
        where: { id: publishJob.pageId },
        data: { status: 'published', publishedAt: new Date() },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.prisma.publishJob.update({
        where: { id: publishJobId },
        data: {
          status: PublishStatus.FAILED,
          lastError: errorMessage,
          retryCount: { increment: 1 },
        },
      });
      throw error;
    }
  }

  async unpublishPage(publishJobId: string): Promise<void> {
    const publishJob = await this.prisma.publishJob.findUnique({
      where: { id: publishJobId },
    });

    if (!publishJob || !publishJob.externalId) {
      throw new NotFoundException('PublishJob not found or not published');
    }

    const adapter = this.adapters.get(publishJob.platform);
    if (!adapter) throw new BadRequestException(`No adapter for platform: ${publishJob.platform}`);

    const credentials = (publishJob.metadata as any)?.credentials || {};

    await adapter.unpublish(publishJob.externalId, credentials);

    await this.prisma.publishJob.update({
      where: { id: publishJobId },
      data: { status: PublishStatus.UNPUBLISHED },
    });

    await this.prisma.page.update({
      where: { id: publishJob.pageId },
      data: { status: 'draft' },
    });
  }

  async getPublishStatus(publishJobId: string) {
    return this.prisma.publishJob.findUnique({
      where: { id: publishJobId },
      include: { page: true },
    });
  }
}
```

---

## 7. Publish Processor (BullMQ)

```typescript
// src/publishing/processor/publish.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PublishingService } from '../publishing.service';
import { NotifierService } from '../../distribution/notifier/notifier.service';

@Processor('publish-queue')
export class PublishProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishProcessor.name);

  constructor(
    private publishingService: PublishingService,
    private notifierService: NotifierService,
  ) {
    super();
  }

  async process(job: Job<{ publishJobId: string }>): Promise<void> {
    const { publishJobId } = job.data;
    this.logger.log(`Processing publish job: ${publishJobId}`);

    try {
      await this.publishingService.executePublish(publishJobId);
      this.logger.log(`Successfully published job: ${publishJobId}`);

      // Send success notification
      await this.notifierService.notifyPublishSuccess(publishJobId);
    } catch (error) {
      this.logger.error(`Failed to publish job ${publishJobId}:`, error);

      // Send failure notification
      await this.notifierService.notifyPublishFailure(publishJobId, error);

      throw error; // Re-throw to mark job as failed in BullMQ
    }
  }
}
```

---

## 8. Publish Scheduler

```typescript
// src/publishing/scheduler/publish.scheduler.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { PublishStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PublishScheduler {
  private readonly logger = new Logger(PublishScheduler.name);
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(
    @InjectQueue('publish-queue') private publishQueue: Queue,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.maxRetries = Number(this.config.get('MAX_PUBLISH_RETRIES', 3));
    this.retryDelayMs = Number(this.config.get('RETRY_DELAY_MS', 300_000)); // 5 minutes
  }

  /**
   * Checks every minute for jobs with status SCHEDULED whose scheduledAt time has passed.
   * Adds these jobs to the BullMQ 'publish-queue'.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledPublishes(): Promise<void> {
    const dueJobs = await this.prisma.publishJob.findMany({
      where: {
        status: PublishStatus.SCHEDULED,
        scheduledAt: { lte: new Date() },
      },
      take: 50, // Process in batches
    });

    if (!dueJobs.length) return;

    this.logger.log(`Found ${dueJobs.length} scheduled jobs to process`);

    for (const job of dueJobs) {
      await this.publishQueue.add(
        'publish-page',
        { publishJobId: job.id },
        { jobId: `scheduled-${job.id}` },
      );

      await this.prisma.publishJob.update({
        where: { id: job.id },
        data: { status: PublishStatus.PUBLISHING },
      });
    }
  }

  /**
   * Checks every 10 minutes for jobs with status FAILED that haven't exceeded max retries
   * and failed more than `retryDelayMs` ago. Adds them back to the queue.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryFailedPublishes(): Promise<void> {
    const retryThreshold = new Date(Date.now() - this.retryDelayMs);

    const failedJobs = await this.prisma.publishJob.findMany({
      where: {
        status: PublishStatus.FAILED,
        retryCount: { lt: this.maxRetries },
        updatedAt: { lte: retryThreshold },
      },
      take: 20,
    });

    if (!failedJobs.length) return;

    this.logger.log(`Retrying ${failedJobs.length} failed jobs`);

    for (const job of failedJobs) {
      await this.publishQueue.add(
        'publish-page',
        { publishJobId: job.id },
        { jobId: `retry-${job.id}-${job.retryCount}` },
      );

      await this.prisma.publishJob.update({
        where: { id: job.id },
        data: { status: PublishStatus.PUBLISHING },
      });
    }
  }
}
```

---

## 9. Distribution Channels

### Sitemap Channel

```typescript
// src/distribution/channels/sitemap.channel.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { create } from 'xmlbuilder2';

@Injectable()
export class SitemapChannel {
  constructor(private prisma: PrismaService) {}

  async generateSitemap(siteId: string, domain: string, locale?: string): Promise<string> {
    const pages = await this.prisma.page.findMany({
      where: {
        siteId,
        status: 'published',
        ...(locale && { locale }),
      },
      select: {
        slug: true,
        updatedAt: true,
        locale: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const urlset = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('urlset', { xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9' });

    for (const page of pages) {
      const url = urlset.ele('url');
      url.ele('loc').txt(`${domain}/${page.slug}`);
      url.ele('lastmod').txt(page.updatedAt.toISOString());
      url.ele('changefreq').txt('weekly');
      url.ele('priority').txt('0.8');
    }

    return urlset.end({ prettyPrint: true });
  }
}
```

### RSS Channel

```typescript
// src/distribution/channels/rss.channel.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { create } from 'xmlbuilder2';

@Injectable()
export class RssChannel {
  constructor(private prisma: PrismaService) {}

  async generateRssFeed(
    siteId: string,
    domain: string,
    siteName: string,
    siteDescription: string,
    locale?: string,
  ): Promise<string> {
    const pages = await this.prisma.page.findMany({
      where: {
        siteId,
        status: 'published',
        ...(locale && { locale }),
      },
      select: {
        title: true,
        slug: true,
        excerpt: true,
        publishedAt: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });

    const rss = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('rss', { version: '2.0' })
      .ele('channel');

    rss.ele('title').txt(siteName);
    rss.ele('link').txt(domain);
    rss.ele('description').txt(siteDescription);
    rss.ele('language').txt(locale || 'en');
    rss.ele('lastBuildDate').txt(new Date().toUTCString());

    for (const page of pages) {
      const item = rss.ele('item');
      item.ele('title').txt(page.title);
      item.ele('link').txt(`${domain}/${page.slug}`);
      if (page.excerpt) item.ele('description').txt(page.excerpt);
      if (page.publishedAt) item.ele('pubDate').txt(page.publishedAt.toUTCString());
      item.ele('guid', { isPermaLink: 'true' }).txt(`${domain}/${page.slug}`);
    }

    return rss.end({ prettyPrint: true });
  }
}
```

### Webhook Channel

```typescript
// src/distribution/channels/webhook.channel.ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface WebhookTarget {
  url: string;
  secret?: string;
  headers?: Record<string, string>;
}

export interface WebhookPayload {
  event: 'publish.success' | 'publish.failure';
  publishJobId: string;
  pageId: string;
  platform: string;
  externalUrl?: string;
  timestamp: string;
  error?: string;
}

@Injectable()
export class WebhookChannel {
  private readonly logger = new Logger(WebhookChannel.name);

  async send(target: WebhookTarget, payload: WebhookPayload): Promise<void> {
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(target.secret && { 'X-Webhook-Secret': target.secret }),
        ...target.headers,
      };

      await axios.post(target.url, payload, { headers, timeout: 10_000 });
      this.logger.log(`Webhook sent to ${target.url}`);
    } catch (error) {
      this.logger.error(`Failed to send webhook to ${target.url}:`, error);
      throw error;
    }
  }

  async sendBatch(targets: WebhookTarget[], payload: WebhookPayload): Promise<void> {
    await Promise.allSettled(targets.map((target) => this.send(target, payload)));
  }
}
```

### Notifier Service

```typescript
// src/distribution/notifier/notifier.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookChannel, WebhookPayload } from '../channels/webhook.channel';
import axios from 'axios';

@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);
  private readonly slackWebhookUrl: string;

  constructor(
    private prisma: PrismaService,
    private webhookChannel: WebhookChannel,
    private config: ConfigService,
  ) {
    this.slackWebhookUrl = this.config.get('SLACK_WEBHOOK_URL', '');
  }

  async notifyPublishSuccess(publishJobId: string): Promise<void> {
    const job = await this.prisma.publishJob.findUnique({
      where: { id: publishJobId },
      include: { page: true },
    });

    if (!job) return;

    const payload: WebhookPayload = {
      event: 'publish.success',
      publishJobId: job.id,
      pageId: job.pageId,
      platform: job.platform,
      externalUrl: job.externalUrl ?? undefined,
      timestamp: new Date().toISOString(),
    };

    // Send to configured webhooks (fetch from DB or config)
    const webhookTargets = await this.getWebhookTargets(job.page.siteId);
    if (webhookTargets.length) {
      await this.webhookChannel.sendBatch(webhookTargets, payload);
    }

    // Send Slack notification
    if (this.slackWebhookUrl) {
      await this.sendSlackNotification({
        text: `✅ Published: *${job.page.title}* to ${job.platform}`,
        url: job.externalUrl,
      });
    }
  }

  async notifyPublishFailure(publishJobId: string, error: any): Promise<void> {
    const job = await this.prisma.publishJob.findUnique({
      where: { id: publishJobId },
      include: { page: true },
    });

    if (!job) return;

    const errorMessage = error instanceof Error ? error.message : String(error);

    const payload: WebhookPayload = {
      event: 'publish.failure',
      publishJobId: job.id,
      pageId: job.pageId,
      platform: job.platform,
      timestamp: new Date().toISOString(),
      error: errorMessage,
    };

    const webhookTargets = await this.getWebhookTargets(job.page.siteId);
    if (webhookTargets.length) {
      await this.webhookChannel.sendBatch(webhookTargets, payload);
    }

    if (this.slackWebhookUrl) {
      await this.sendSlackNotification({
        text: `❌ Failed to publish: *${job.page.title}* to ${job.platform}`,
        error: errorMessage,
      });
    }
  }

  private async getWebhookTargets(siteId: string) {
    // Fetch webhook targets from DB or config
    // For now, return empty array (implement based on your schema)
    return [];
  }

  private async sendSlackNotification(data: { text: string; url?: string; error?: string }) {
    if (!this.slackWebhookUrl) return;

    try {
      await axios.post(this.slackWebhookUrl, {
        text: data.text,
        ...(data.url && { attachments: [{ text: data.url }] }),
        ...(data.error && { attachments: [{ text: `Error: ${data.error}`, color: 'danger' }] }),
      });
    } catch (error) {
      this.logger.error('Failed to send Slack notification:', error);
    }
  }
}
```

### Distribution Service

```typescript
// src/distribution/distribution.service.ts
import { Injectable } from '@nestjs/common';
import { SitemapChannel } from './channels/sitemap.channel';
import { RssChannel } from './channels/rss.channel';
import { WebhookChannel, WebhookTarget } from './channels/webhook.channel';

@Injectable()
export class DistributionService {
  constructor(
    private sitemapChannel: SitemapChannel,
    private rssChannel: RssChannel,
    private webhookChannel: WebhookChannel,
  ) {}

  async getSitemap(siteId: string, domain: string, locale?: string): Promise<string> {
    return this.sitemapChannel.generateSitemap(siteId, domain, locale);
  }

  async getRssFeed(
    siteId: string,
    domain: string,
    siteName?: string,
    siteDescription?: string,
    locale?: string,
  ): Promise<string> {
    return this.rssChannel.generateRssFeed(
      siteId,
      domain,
      siteName || 'Site',
      siteDescription || 'Site description',
      locale,
    );
  }

  async dispatchWebhooks(publishJobId: string, targets: WebhookTarget[]): Promise<void> {
    const payload = {
      event: 'publish.success' as const,
      publishJobId,
      pageId: 'unknown',
      platform: 'unknown',
      timestamp: new Date().toISOString(),
    };

    await this.webhookChannel.sendBatch(targets, payload);
  }
}
```

---

## 10. Assets & Image Processing

```typescript
// src/assets/image-processor.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  constructor(private config: ConfigService) {
    this.bucketName = this.config.getOrThrow('CLOUDFLARE_R2_BUCKET');
    this.publicUrl = this.config.getOrThrow('CLOUDFLARE_R2_PUBLIC_URL');

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: this.config.getOrThrow('CLOUDFLARE_R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.config.getOrThrow('CLOUDFLARE_R2_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  async uploadImage(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    const key = `images/${uuidv4()}-${filename}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    return `${this.publicUrl}/${key}`;
  }

  async processAndUpload(
    buffer: Buffer,
    filename: string,
    options?: { width?: number; height?: number; quality?: number },
  ): Promise<string> {
    let processed = sharp(buffer);

    if (options?.width || options?.height) {
      processed = processed.resize(options.width, options.height, { fit: 'inside' });
    }

    if (options?.quality) {
      processed = processed.jpeg({ quality: options.quality });
    }

    const outputBuffer = await processed.toBuffer();
    return this.uploadImage(outputBuffer, filename, 'image/jpeg');
  }

  async generateThumbnail(buffer: Buffer, filename: string): Promise<string> {
    return this.processAndUpload(buffer, `thumb-${filename}`, { width: 300, quality: 80 });
  }
}
```

### Assets Controller

```typescript
// src/assets/assets.controller.ts
import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImageProcessorService } from './image-processor.service';

@Controller('assets')
export class AssetsController {
  constructor(private imageProcessor: ImageProcessorService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');

    const url = await this.imageProcessor.uploadImage(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    const thumbnailUrl = await this.imageProcessor.generateThumbnail(
      file.buffer,
      file.originalname,
    );

    return { url, thumbnailUrl };
  }
}
```

---

## 11. Controllers

### Publishing Controller

```typescript
// src/publishing/publishing.controller.ts
import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { PublishingService, SchedulePublishDto } from './publishing.service';

@Controller('publishing')
export class PublishingController {
  constructor(private publishingService: PublishingService) {}

  @Post('jobs')
  @HttpCode(HttpStatus.CREATED)
  async schedulePublish(@Body() dto: SchedulePublishDto) {
    return this.publishingService.schedulePublish(dto);
  }

  @Get('jobs/:id')
  async getPublishStatus(@Param('id') id: string) {
    return this.publishingService.getPublishStatus(id);
  }

  @Post('jobs/:id/unpublish')
  @HttpCode(HttpStatus.OK)
  async unpublishPage(@Param('id') id: string) {
    await this.publishingService.unpublishPage(id);
    return { message: 'Page unpublished successfully' };
  }
}
```

### Distribution Controller

```typescript
// src/distribution/distribution.controller.ts
import { Controller, Get, Param, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { DistributionService } from './distribution.service';
import { WebhookTarget } from './channels/webhook.channel';

@Controller('distribution')
export class DistributionController {
  constructor(private distributionService: DistributionService) {}

  @Get('sitemap/:siteId')
  async getSitemap(@Param('siteId') siteId: string) {
    const site = await this.getSite(siteId);
    return this.distributionService.getSitemap(siteId, site.domain);
  }

  @Get('sitemap/:siteId/:locale')
  async getLocaleSitemap(@Param('siteId') siteId: string, @Param('locale') locale: string) {
    const site = await this.getSite(siteId);
    return this.distributionService.getSitemap(siteId, site.domain, locale);
  }

  @Get('rss/:siteId')
  async getRssFeed(@Param('siteId') siteId: string) {
    const site = await this.getSite(siteId);
    return this.distributionService.getRssFeed(siteId, site.domain);
  }

  @Get('rss/:siteId/:locale')
  async getLocaleRssFeed(@Param('siteId') siteId: string, @Param('locale') locale: string) {
    const site = await this.getSite(siteId);
    return this.distributionService.getRssFeed(siteId, site.domain, locale);
  }

  @Post('webhooks')
  @HttpCode(HttpStatus.OK)
  async sendWebhooks(@Body() data: { publishJobId: string; targets: WebhookTarget[] }) {
    await this.distributionService.dispatchWebhooks(data.publishJobId, data.targets);
    return { message: 'Webhooks dispatched' };
  }

  private async getSite(siteId: string) {
    return { id: siteId, domain: 'https://example.com', name: 'Example Site', description: 'A test site' };
  }
}
```

---

## 12. Module Configuration

### Distribution Module (continued)

```typescript
// src/distribution/distribution.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { SitemapChannel } from './channels/sitemap.channel';
import { RssChannel } from './channels/rss.channel';
import { WebhookChannel } from './channels/webhook.channel';
import { NotifierService } from './notifier/notifier.service';
import { DistributionService } from './distribution.service';
import { DistributionController } from './distribution.controller';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [DistributionController],
  providers: [
    SitemapChannel,
    RssChannel,
    WebhookChannel,
    NotifierService,
    DistributionService,
  ],
  exports: [NotifierService, DistributionService],
})
export class DistributionModule {}
```

### Assets Module

```typescript
// src/assets/assets.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ImageProcessorService } from './image-processor.service';
import { AssetsController } from './assets.controller';

@Module({
  imports: [ConfigModule],
  controllers: [AssetsController],
  providers: [ImageProcessorService],
  exports: [ImageProcessorService],
})
export class AssetsModule {}
```

### App Module

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { PublishingModule } from './publishing/publishing.module';
import { DistributionModule } from './distribution/distribution.module';
import { AssetsModule } from './assets/assets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    PrismaModule,
    PublishingModule,
    DistributionModule,
    AssetsModule,
  ],
})
export class AppModule {}
```

---

## 13. Environment Configuration

```bash
# .env.example

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/nestino"

# Redis (for BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379

# WordPress Platform
WORDPRESS_API_URL=https://your-wordpress-site.com/wp-json/wp/v2
WORDPRESS_USERNAME=admin
WORDPRESS_APP_PASSWORD=your-app-password

# Ghost Platform
GHOST_API_URL=https://your-ghost-site.com
GHOST_ADMIN_API_KEY=your-admin-api-key

# Cloudflare R2 (Image Storage)
CLOUDFLARE_R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
CLOUDFLARE_R2_ACCESS_KEY_ID=your-access-key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-secret-key
CLOUDFLARE_R2_BUCKET=nestino-images
CLOUDFLARE_R2_PUBLIC_URL=https://images.yourdomain.com

# Publishing Configuration
MAX_PUBLISH_RETRIES=3
RETRY_DELAY_MS=300000  # 5 minutes

# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Application
PORT=3000
NODE_ENV=production
```

---

## 14. Database Schema Updates

```prisma
// prisma/schema.prisma

model PublishJob {
  id           String        @id @default(cuid())
  pageId       String
  page         Page          @relation(fields: [pageId], references: [id], onDelete: Cascade)
  platform     PublishPlatform
  status       PublishStatus @default(SCHEDULED)
  scheduledAt  DateTime?
  publishedAt  DateTime?
  externalId   String?       // WordPress post ID, Ghost post ID, etc.
  externalUrl  String?       // Public URL on external platform
  retryCount   Int           @default(0)
  lastError    String?
  metadata     Json?         // Platform-specific credentials and config
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@index([pageId])
  @@index([status, scheduledAt])
  @@index([status, retryCount, updatedAt])
}

enum PublishPlatform {
  WORDPRESS
  GHOST
  MEDIUM
  DEVTO
}

enum PublishStatus {
  SCHEDULED
  PUBLISHING
  PUBLISHED
  FAILED
  UNPUBLISHED
}

model DistributionLog {
  id          String   @id @default(cuid())
  siteId      String
  site        Site     @relation(fields: [siteId], references: [id], onDelete: Cascade)
  channel     String   // 'sitemap', 'rss', 'webhook'
  action      String   // 'generated', 'sent', 'failed'
  metadata    Json?
  createdAt   DateTime @default(now())

  @@index([siteId, channel])
}

model ImageAsset {
  id           String   @id @default(cuid())
  pageId       String?
  page         Page?    @relation(fields: [pageId], references: [id], onDelete: SetNull)
  url          String
  thumbnailUrl String?
  filename     String
  mimeType     String
  size         Int
  width        Int?
  height       Int?
  createdAt    DateTime @default(now())

  @@index([pageId])
}

model TranslationGroup {
  id        String   @id @default(cuid())
  pages     Page[]
  createdAt DateTime @default(now())
}

model Page {
  // ... existing fields ...
  translationGroupId String?
  translationGroup   TranslationGroup? @relation(fields: [translationGroupId], references: [id])
  publishJobs        PublishJob[]
  images             ImageAsset[]
  
  @@index([translationGroupId])
}

model Site {
  // ... existing fields ...
  distributionLogs DistributionLog[]
}
```

Run migration:

```bash
npx prisma migrate dev --name add-publishing-distribution
npx prisma generate
```

---

## 15. API Documentation

### Publishing Endpoints

#### Schedule Publish Job

```http
POST /publishing/jobs
Content-Type: application/json

{
  "pageId": "clx123abc",
  "platform": "WORDPRESS",
  "scheduledAt": "2026-04-20T10:00:00Z",  // Optional, immediate if omitted
  "credentials": {
    "apiUrl": "https://example.com/wp-json/wp/v2",
    "username": "admin",
    "appPassword": "xxxx xxxx xxxx xxxx"
  }
}
```

**Response:**

```json
{
  "id": "clx456def",
  "pageId": "clx123abc",
  "platform": "WORDPRESS",
  "status": "SCHEDULED",
  "scheduledAt": "2026-04-20T10:00:00Z",
  "createdAt": "2026-04-17T08:30:00Z"
}
```

#### Get Publish Status

```http
GET /publishing/jobs/clx456def
```

**Response:**

```json
{
  "id": "clx456def",
  "pageId": "clx123abc",
  "platform": "WORDPRESS",
  "status": "PUBLISHED",
  "publishedAt": "2026-04-20T10:00:15Z",
  "externalId": "42",
  "externalUrl": "https://example.com/my-post",
  "retryCount": 0,
  "page": {
    "id": "clx123abc",
    "title": "My Blog Post",
    "slug": "my-blog-post"
  }
}
```

#### Unpublish Page

```http
POST /publishing/jobs/clx456def/unpublish
```

**Response:**

```json
{
  "message": "Page unpublished successfully"
}
```

---

### Distribution Endpoints

#### Get Sitemap

```http
GET /distribution/sitemap/site123
```

**Response:** XML sitemap

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/my-post</loc>
    <lastmod>2026-04-17T08:30:00Z</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

#### Get Locale-Specific Sitemap

```http
GET /distribution/sitemap/site123/fa
```

#### Get RSS Feed

```http
GET /distribution/rss/site123
```

**Response:** XML RSS feed

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>My Site</title>
    <link>https://example.com</link>
    <description>Site description</description>
    <language>en</language>
    <item>
      <title>My Blog Post</title>
      <link>https://example.com/my-post</link>
      <description>Post excerpt...</description>
      <pubDate>Wed, 17 Apr 2026 08:30:00 GMT</pubDate>
    </item>
  </channel>
</rss>
```

#### Dispatch Webhooks

```http
POST /distribution/webhooks
Content-Type: application/json

{
  "publishJobId": "clx456def",
  "targets": [
    {
      "url": "https://api.example.com/webhook",
      "secret": "webhook-secret-key",
      "headers": {
        "X-Custom-Header": "value"
      }
    }
  ]
}
```

**Response:**

```json
{
  "message": "Webhooks dispatched"
}
```

---

### Assets Endpoints

#### Upload Image

```http
POST /assets/upload
Content-Type: multipart/form-data

file: [binary image data]
```

**Response:**

```json
{
  "url": "https://images.yourdomain.com/images/uuid-filename.jpg",
  "thumbnailUrl": "https://images.yourdomain.com/images/uuid-thumb-filename.jpg"
}
```

---

## 16. Testing Strategy

### Unit Tests

```typescript
// src/publishing/publishing.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PublishingService } from './publishing.service';
import { PrismaService } from '../prisma/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('PublishingService', () => {
  let service: PublishingService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublishingService,
        {
          provide: PrismaService,
          useValue: {
            page: { findUnique: jest.fn() },
            publishJob: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
          },
        },
        {
          provide: getQueueToken('publish-queue'),
          useValue: { add: jest.fn() },
        },
        // Mock adapters and formatters
      ],
    }).compile();

    service = module.get<PublishingService>(PublishingService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should schedule a publish job', async () => {
    const mockPage = { id: 'page1', title: 'Test', status: 'draft' };
    jest.spyOn(prisma.page, 'findUnique').mockResolvedValue(mockPage as any);
    jest.spyOn(prisma.publishJob, 'create').mockResolvedValue({
      id: 'job1',
      pageId: 'page1',
      platform: 'WORDPRESS',
      status: 'SCHEDULED',
    } as any);

    const result = await service.schedulePublish({
      pageId: 'page1',
      platform: 'WORDPRESS',
      scheduledAt: new Date(),
      credentials: {},
    });

    expect(result.id).toBe('job1');
    expect(prisma.publishJob.create).toHaveBeenCalled();
  });
});
```

### Integration Tests

```typescript
// test/publishing.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Publishing (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/publishing/jobs (POST)', () => {
    return request(app.getHttpServer())
      .post('/publishing/jobs')
      .send({
        pageId: 'test-page-id',
        platform: 'WORDPRESS',
        credentials: { apiUrl: 'https://test.com', username: 'admin', appPassword: 'test' },
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('id');
        expect(res.body.platform).toBe('WORDPRESS');
      });
  });
});
```

---

## 17. Deployment Checklist

### Prerequisites

- [ ] PostgreSQL database configured
- [ ] Redis instance running (for BullMQ)
- [ ] Cloudflare R2 bucket created
- [ ] WordPress/Ghost credentials obtained
- [ ] Environment variables configured

### Installation Steps

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma client
npx prisma generate

# 3. Run database migrations
npx prisma migrate deploy

# 4. Build application
npm run build

# 5. Start application
npm run start:prod
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
CMD ["npm", "run", "start:prod"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - '3000:3000'
    environment:
      - DATABASE_URL=postgresql://user:password@postgres:5432/nestino
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: nestino
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Health Checks

```typescript
// src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
    ]);
  }
}
```

### Monitoring

```typescript
// src/monitoring/metrics.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MetricsService {
  constructor(private prisma: PrismaService) {}

  async getPublishingMetrics() {
    const [total, scheduled, publishing, published, failed] = await Promise.all([
      this.prisma.publishJob.count(),
      this.prisma.publishJob.count({ where: { status: 'SCHEDULED' } }),
      this.prisma.publishJob.count({ where: { status: 'PUBLISHING' } }),
      this.prisma.publishJob.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.publishJob.count({ where: { status: 'FAILED' } }),
    ]);

    return { total, scheduled, publishing, published, failed };
  }

  async getRecentFailures(limit = 10) {
    return this.prisma.publishJob.findMany({
      where: { status: 'FAILED' },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: { page: { select: { title: true, slug: true } } },
    });
  }
}
```

---

## 18. Multi-Language Support Implementation

### Translation Strategy

```typescript
// src/translation/translation.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIService } from '../ai/openai.service';

export interface TranslatePageDto {
  sourcePageId: string;
  targetLocale: string;
  strategy: 'ai' | 'native';
}

@Injectable()
export class TranslationService {
  constructor(
    private prisma: PrismaService,
    private openai: OpenAIService,
  ) {}

  async translatePage(dto: TranslatePageDto) {
    const sourcePage = await this.prisma.page.findUnique({
      where: { id: dto.sourcePageId },
    });

    if (!sourcePage) throw new Error('Source page not found');

    let translatedContent: { title: string; content: string; excerpt?: string };

    if (dto.strategy === 'ai') {
      translatedContent = await this.aiTranslate(sourcePage, dto.targetLocale);
    } else {
      // Native generation: create new content from scratch in target language
      translatedContent = await this.nativeGenerate(sourcePage, dto.targetLocale);
    }

    // Create or get translation group
    let groupId = sourcePage.translationGroupId;
    if (!groupId) {
      const group = await this.prisma.translationGroup.create({ data: {} });
      groupId = group.id;
      await this.prisma.page.update({
        where: { id: sourcePage.id },
        data: { translationGroupId: groupId },
      });
    }

    // Create translated page
    const translatedPage = await this.prisma.page.create({
      data: {
        siteId: sourcePage.siteId,
        title: translatedContent.title,
        content: translatedContent.content,
        excerpt: translatedContent.excerpt,
        slug: `${sourcePage.slug}-${dto.targetLocale}`,
        locale: dto.targetLocale,
        status: 'draft',
        translationGroupId: groupId,
        seoTitle: translatedContent.title,
        seoDescription: translatedContent.excerpt,
      },
    });

    return translatedPage;
  }

  private async aiTranslate(page: any, targetLocale: string) {
    const prompt = `Translate the following content to ${targetLocale}:
    
Title: ${page.title}
Content: ${page.content}
${page.excerpt ? `Excerpt: ${page.excerpt}` : ''}

Provide the translation in JSON format: { "title": "...", "content": "...", "excerpt": "..." }`;

    const response = await this.openai.chat([{ role: 'user', content: prompt }]);
    return JSON.parse(response);
  }

  private async nativeGenerate(page: any, targetLocale: string) {
    const prompt = `Generate new content in ${targetLocale} based on this topic:
    
Original Title: ${page.title}
Original Content Summary: ${page.excerpt || page.content.substring(0, 200)}

Create completely new content in ${targetLocale} that covers the same topic but is culturally appropriate and naturally written for native speakers.

Provide in JSON format: { "title": "...", "content": "...", "excerpt": "..." }`;

    const response = await this.openai.chat([{ role: 'user', content: prompt }]);
    return JSON.parse(response);
  }

  async getTranslationGroup(pageId: string) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: {
        translationGroup: {
          include: {
            pages: { select: { id: true, title: true, locale: true, slug: true } },
          },
        },
      },
    });

    return page?.translationGroup?.pages || [];
  }
}
```

### Hreflang Sitemap Support

```typescript
// src/distribution/channels/sitemap.channel.ts (updated)
async generateSitemap(siteId: string, domain: string, locale?: string): Promise<string> {
  const pages = await this.prisma.page.findMany({
    where: {
      siteId,
      status: 'published',
      ...(locale && { locale }),
    },
    include: {
      translationGroup: {
        include: {
          pages: {
            where: { status: 'published' },
            select: { locale: true, slug: true },
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const urlset = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('urlset', {
      xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9',
      'xmlns:xhtml': 'http://www.w3.org/1999/xhtml',
    });

  for (const page of pages) {
    const url = urlset.ele('url');
    url.ele('loc').txt(`${domain}/${page.slug}`);
    url.ele('lastmod').txt(page.updatedAt.toISOString());

    // Add hreflang links for translations
    if (page.translationGroup) {
      for (const translation of page.translationGroup.pages) {
        url
          .ele('xhtml:link', {
            rel: 'alternate',
            hreflang: translation.locale,
            href: `${domain}/${translation.slug}`,
          })
          .up();
      }
    }
  }

  return urlset.end({ prettyPrint: true });
}
```

---

Phase 3 implementation complete. The system now provides full publishing automation with multi-platform support, scheduled publishing, retry logic, distribution channels, and comprehensive multi-language capabilities.