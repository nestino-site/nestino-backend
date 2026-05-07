import { Module } from '@nestjs/common';
import { SiteConfigController } from './controllers/site-config.controller';
import { SiteConfigService } from './site-config.service';

@Module({
  controllers: [SiteConfigController],
  providers: [SiteConfigService],
  exports: [SiteConfigService],
})
export class ConfigModule {}
