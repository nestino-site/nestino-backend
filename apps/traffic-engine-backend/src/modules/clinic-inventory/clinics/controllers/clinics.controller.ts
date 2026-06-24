import {
  Controller, Get, Post, Patch, Param, Body, Query, ParseIntPipe, Res, NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ClinicsService } from '../services/clinics.service';
import { CreateClinicDto, UpdateClinicDto } from '../dto/create-clinic.dto';
import { ListClinicsDto } from '../dto/list-clinics.dto';
import { UpsertClinicTreatmentDto } from '../dto/upsert-clinic-treatment.dto';
import { CreatePricingPackageDto, UpdatePricingPackageDto } from '../dto/create-pricing-package.dto';
import { Public } from '../../../identity/decorators/public.decorator';

@ApiTags('Clinics')
@Controller()
export class ClinicsController {
  constructor(private readonly clinics: ClinicsService) {}

  @Get('clinics')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'List published clinics (cursor-paginated)' })
  listClinics(@Query() query: ListClinicsDto) {
    return this.clinics.listClinics(query);
  }

  // Tighter limit on the photo proxy: max 30 requests per minute per IP.
  // Each successful response is a Cloudinary 302 redirect (free), but this
  // guards against bots driving high request volume.
  @Get('clinics/:id/photo')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Stream clinic primary photo (CDN redirect)' })
  async clinicPhoto(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    await this.clinics.streamPrimaryPhoto(id, res);
  }

  @Get('clinics/:identifier')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Get clinic by slug or numeric id' })
  getClinic(@Param('identifier') identifier: string) {
    return this.clinics.findBySlugOrId(identifier);
  }

  @Get('compare')
  @Public()
  @ApiOperation({ summary: 'Compare two cities or countries' })
  @ApiQuery({ name: 'cityA', required: false, type: Number })
  @ApiQuery({ name: 'cityB', required: false, type: Number })
  @ApiQuery({ name: 'countryA', required: false, type: Number })
  @ApiQuery({ name: 'countryB', required: false, type: Number })
  compare(
    @Query('cityA') cityA?: string,
    @Query('cityB') cityB?: string,
    @Query('countryA') countryA?: string,
    @Query('countryB') countryB?: string,
  ) {
    if (cityA && cityB) return this.clinics.compareBy('city', Number(cityA), Number(cityB));
    if (countryA && countryB) return this.clinics.compareBy('country', Number(countryA), Number(countryB));
    return { error: 'Provide cityA+cityB or countryA+countryB' };
  }

  @Post('clinics')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create clinic (admin)' })
  createClinic(@Body() dto: CreateClinicDto) {
    return this.clinics.create(dto);
  }

  @Patch('clinics/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update clinic (admin)' })
  updateClinic(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClinicDto) {
    return this.clinics.update(id, dto);
  }

  @Post('clinics/:id/publish')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish clinic (admin)' })
  publishClinic(@Param('id', ParseIntPipe) id: number) {
    return this.clinics.publish(id);
  }

  @Post('clinics/:id/archive')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Archive clinic (admin)' })
  archiveClinic(@Param('id', ParseIntPipe) id: number) {
    return this.clinics.archive(id);
  }

  @Post('clinics/:id/treatments')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add / update treatment offered by clinic (admin)' })
  upsertTreatment(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertClinicTreatmentDto) {
    return this.clinics.upsertTreatment(id, dto);
  }

  @Post('clinics/:id/pricing-packages')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add pricing package to clinic (admin)' })
  createPricingPackage(@Param('id', ParseIntPipe) id: number, @Body() dto: CreatePricingPackageDto) {
    return this.clinics.createPricingPackage(id, dto);
  }

  @Patch('clinics/:id/pricing-packages/:packageId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update pricing package (admin)' })
  updatePricingPackage(
    @Param('id', ParseIntPipe) id: number,
    @Param('packageId', ParseIntPipe) packageId: number,
    @Body() dto: UpdatePricingPackageDto,
  ) {
    return this.clinics.updatePricingPackage(id, packageId, dto);
  }
}
