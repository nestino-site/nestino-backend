import { Module } from '@nestjs/common';
import { ContentApiController } from './controllers/content-api.controller';
import { ContentStateManagerService } from './content-state-manager.service';
import { NextJsContractMapperService } from './next-js-contract-mapper.service';

@Module({
  controllers: [ContentApiController],
  providers: [ContentStateManagerService, NextJsContractMapperService],
  exports: [ContentStateManagerService, NextJsContractMapperService],
})
export class ContentApiModule {}
