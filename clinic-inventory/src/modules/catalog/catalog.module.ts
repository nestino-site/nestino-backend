import { Module } from '@nestjs/common';
import { CatalogService } from './services/catalog.service';
import { CatalogController } from './controllers/catalog.controller';

@Module({
  providers: [CatalogService],
  controllers: [CatalogController],
  exports: [CatalogService],
})
export class CatalogModule {}
