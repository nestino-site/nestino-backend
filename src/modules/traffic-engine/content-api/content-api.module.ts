import { Module } from '@nestjs/common';
import { SeoStrategyModule } from '../seo-strategy/seo-strategy.module';
import { ContentApiController } from './controllers/content-api.controller';
import { ContentStateManagerService } from './content-state-manager.service';
import { NextJsContractMapperService } from './next-js-contract-mapper.service';

@Module({
  imports: [SeoStrategyModule],
  controllers: [ContentApiController],
  providers: [ContentStateManagerService, NextJsContractMapperService],
  exports: [ContentStateManagerService, NextJsContractMapperService],
})
export class ContentApiModule {}
