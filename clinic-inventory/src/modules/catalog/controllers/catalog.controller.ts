import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CatalogService } from '../services/catalog.service';
import { CreateTreatmentDto, UpdateTreatmentDto } from '../dto/create-treatment.dto';
import { CreateAccreditationDto, UpdateAccreditationDto } from '../dto/create-accreditation.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

@ApiTags('Catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // ── Treatments ─────────────────────────────────────────────────────────────

  @Get('treatments')
  @ApiOperation({ summary: 'List treatments' })
  @ApiQuery({ name: 'all', required: false, type: Boolean, description: 'Include inactive' })
  listTreatments(@Query('all') all?: string) {
    return this.catalog.findAllTreatments(all !== 'true');
  }

  @Get('treatments/:code')
  @ApiOperation({ summary: 'Get treatment by code' })
  getTreatment(@Param('code') code: string) {
    return this.catalog.findTreatment(code.toUpperCase());
  }

  @Post('treatments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create treatment (admin)' })
  createTreatment(@Body() dto: CreateTreatmentDto) {
    return this.catalog.createTreatment(dto);
  }

  @Patch('treatments/:code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update treatment (admin)' })
  updateTreatment(@Param('code') code: string, @Body() dto: UpdateTreatmentDto) {
    return this.catalog.updateTreatment(code.toUpperCase(), dto);
  }

  // ── Accreditations ─────────────────────────────────────────────────────────

  @Get('accreditations')
  @ApiOperation({ summary: 'List accreditations' })
  @ApiQuery({ name: 'all', required: false, type: Boolean })
  listAccreditations(@Query('all') all?: string) {
    return this.catalog.findAllAccreditations(all !== 'true');
  }

  @Get('accreditations/:code')
  @ApiOperation({ summary: 'Get accreditation by code' })
  getAccreditation(@Param('code') code: string) {
    return this.catalog.findAccreditation(code.toUpperCase());
  }

  @Post('accreditations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create accreditation (admin)' })
  createAccreditation(@Body() dto: CreateAccreditationDto) {
    return this.catalog.createAccreditation(dto);
  }

  @Patch('accreditations/:code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update accreditation (admin)' })
  updateAccreditation(@Param('code') code: string, @Body() dto: UpdateAccreditationDto) {
    return this.catalog.updateAccreditation(code.toUpperCase(), dto);
  }

  // ── Truth Score Dimensions ─────────────────────────────────────────────────

  @Get('truth-score-dimensions')
  @ApiOperation({ summary: 'List Truth Score dimensions and weights' })
  listDimensions() {
    return this.catalog.findAllDimensions();
  }
}
