import './bootstrap-env';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/global-http-exception.filter';

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, '');
}

function parseCorsOrigins(): string[] | boolean {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) {
    return [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5001',
    ];
  }
  if (raw === '*') {
    return true;
  }
  return raw
    .split(',')
    .map((o) => normalizeOrigin(o.trim()))
    .filter(Boolean);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const corsOrigins = parseCorsOrigins();
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Site-Api-Key',
      'X-Site-Id',
      'X-Requested-With',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  app.setGlobalPrefix('api/v1');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Traffic Engine Backend API')
    .setDescription(
      'SEO and content generation API for Nestino / Traffic Engine. ' +
        'Admin endpoints require JWT bearer auth (login via POST /identity/login). ' +
        'Content delivery endpoints require the site API key header.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'bearer',
    )
    .addApiKey(
      { type: 'apiKey', name: 'x-site-api-key', in: 'header' },
      'site-api-key',
    )
    .addTag('Identity', 'Authentication and current user profile')
    .addTag('Sites', 'Site management and bulk generation')
    .addTag('Site Config', 'Per-site AI pipeline and runtime configuration')
    .addTag('Keywords', 'Keyword research and cluster management')
    .addTag('Pages', 'Page CRUD and content pipeline actions')
    .addTag('Content Tasks', 'Background content generation tasks')
    .addTag('Subjects', 'Editorial subjects and topic hubs')
    .addTag('Content Ideas', 'AI-generated content ideas and review workflow')
    .addTag('Idea Tasks', 'Tasks created from approved content ideas')
    .addTag('Templates', 'Content structure templates')
    .addTag('SEO Metrics', 'Search Console and analytics metrics')
    .addTag('SEO Strategy', 'Quick wins, cannibalization, and schema generation')
    .addTag('Keyword Research', 'Seed keyword enrichment')
    .addTag('Images', 'Hero image fetch and generation')
    .addTag('Content API', 'Published content for frontends (site API key)')
    .addTag('Content Preview', 'Draft content preview (site API key)')
    .addTag('Sitemap', 'Sitemap and robots.txt (public)')
    .addTag('Clinic Inventory Webhook', 'Inbound clinic publish webhooks (legacy HTTP)')
    .addTag('Clinics', 'Clinic directory and admin CRUD')
    .addTag('Geo', 'Countries and destination cities')
    .addTag('Catalog', 'Treatments, accreditations, Truth Score dimensions')
    .addTag('Discovery', 'Google Places clinic discovery pipeline')
    .addTag('Discovery Config', 'Per-city discovery pipeline configuration')
    .addTag('Truth Score', 'Clinic Truth Score computation')
    .addTag('Interviews', 'Patient interview workflow')
    .addTag('Media', 'Clinic media assets')
    .addTag('Clinic Publishing', 'Clinic publish delivery audit log')
    .addTag('Debug', 'Prompt debugging utilities')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('swagger', app, swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
  });

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

void bootstrap();
