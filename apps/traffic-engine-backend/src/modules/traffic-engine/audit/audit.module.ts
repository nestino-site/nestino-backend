import { Module } from '@nestjs/common';
import { AuditController } from './controllers/audit.controller';
import { GeminiAuditService } from './services/gemini-audit.service';

@Module({
  controllers: [AuditController],
  providers: [GeminiAuditService],
  exports: [GeminiAuditService],
})
export class AuditModule {}
