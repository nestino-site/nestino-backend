import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { IdentityController } from './controllers/identity.controller';
import { AppAuthGuard } from './guards/app-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SiteApiKeyGuard } from './guards/site-api-key.guard';
import { IdentityAuthService } from './services/identity-auth.service';
import { IdentityJwtService } from './services/identity-jwt.service';
import { PasswordService } from './services/password.service';
import { SiteApiKeyService } from './services/site-api-key.service';

@Global()
@Module({
  controllers: [IdentityController],
  providers: [
    PasswordService,
    SiteApiKeyService,
    IdentityJwtService,
    IdentityAuthService,
    JwtAuthGuard,
    SiteApiKeyGuard,
    AppAuthGuard,
    {
      provide: APP_GUARD,
      useClass: AppAuthGuard,
    },
  ],
  exports: [SiteApiKeyService, PasswordService, IdentityJwtService, IdentityAuthService],
})
export class IdentityModule {}
