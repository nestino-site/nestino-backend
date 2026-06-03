import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PublishingService } from '../services/publishing.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

@ApiTags('Publishing')
@Controller('admin/webhook-deliveries')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PublishingController {
  constructor(private readonly svc: PublishingService) {}

  @Get()
  @ApiOperation({ summary: 'List webhook delivery attempts (admin)' })
  @ApiQuery({ name: 'clinicId', required: false, type: Number })
  list(@Query('clinicId') clinicId?: string) {
    return this.svc.listDeliveries(clinicId ? Number(clinicId) : undefined);
  }
}
