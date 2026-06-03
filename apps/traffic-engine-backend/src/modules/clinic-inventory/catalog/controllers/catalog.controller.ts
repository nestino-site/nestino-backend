import {
  Controller, Get, Post, Patch, Param, Body, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CatalogService } from '../services/catalog.service';
import { CreateTreatmentDto, UpdateTreatmentDto } from '../dto/create-treatment.dto';
import { CreateAccreditationDto, UpdateAccreditationDto } from '../dto/create-accreditation.dto';
import { Public } from '../../../identity/decorators/public.decorator';

@ApiTags('Catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('treatments')
  @Public()
  @ApiOperation({ summary: 'List treatments' })
  @ApiQuery({ name: 'all', required: false, type: Boolean, description: 'Include inactive' })
  listTreatments(@Query('all') all?: string) {
    return this.catalog.findAllTreatments(all !== 'true');
  }

  @Get('treatments/:code')
  @Public()
  @ApiOperation({ summary: 'Get treatment by code' })
  getTreatment(@Param('code') code: string) {
    return this.catalog.findTreatment(code.toUpperCase());
  }

  @Post('treatments')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create treatment (admin)' })
  createTreatment(@Body() dto: CreateTreatmentDto) {
    return this.catalog.createTreatment(dto);
  }

  @Patch('treatments/:code')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update treatment (admin)' })
  updateTreatment(@Param('code') code: string, @Body() dto: UpdateTreatmentDto) {
    return this.catalog.updateTreatment(code.toUpperCase(), dto);
  }

  @Get('accreditations')
  @Public()
  @ApiOperation({ summary: 'List accreditations' })
  @ApiQuery({ name: 'all', required: false, type: Boolean })
  listAccreditations(@Query('all') all?: string) {
    return this.catalog.findAllAccreditations(all !== 'true');
  }

  @Get('accreditations/:code')
  @Public()
  @ApiOperation({ summary: 'Get accreditation by code' })
  getAccreditation(@Param('code') code: string) {
    return this.catalog.findAccreditation(code.toUpperCase());
  }

  @Post('accreditations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create accreditation (admin)' })
  createAccreditation(@Body() dto: CreateAccreditationDto) {
    return this.catalog.createAccreditation(dto);
  }

  @Patch('accreditations/:code')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update accreditation (admin)' })
  updateAccreditation(@Param('code') code: string, @Body() dto: UpdateAccreditationDto) {
    return this.catalog.updateAccreditation(code.toUpperCase(), dto);
  }

  @Get('truth-score-dimensions')
  @Public()
  @ApiOperation({ summary: 'List Truth Score dimensions and weights' })
  listDimensions() {
    return this.catalog.findAllDimensions();
  }
}
