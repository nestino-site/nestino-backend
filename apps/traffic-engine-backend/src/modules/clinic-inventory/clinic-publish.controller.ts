import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClinicPublishBridge } from './clinic-publish.bridge';

@ApiTags('Clinic Publishing')
@Controller()
export class ClinicPublishController {
  constructor(private readonly bridge: ClinicPublishBridge) {}

  @Get('admin/webhook-deliveries')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List clinic publish delivery records (admin)' })
  listDeliveries(@Query('clinicId') clinicId?: string) {
    return this.bridge.listDeliveries(clinicId ? Number(clinicId) : undefined);
  }
}
