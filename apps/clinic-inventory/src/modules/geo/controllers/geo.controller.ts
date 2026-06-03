import {
  Controller, Get, Post, Patch, Param, Body, ParseIntPipe, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { GeoService } from '../services/geo.service';
import { CreateCountryDto, UpdateCountryDto } from '../dto/create-country.dto';
import { CreateCityDto, UpdateCityDto } from '../dto/create-city.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

@ApiTags('Geo')
@Controller()
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  // ── Countries ──────────────────────────────────────────────────────────────

  @Get('countries')
  @ApiOperation({ summary: 'List all countries' })
  listCountries() {
    return this.geo.findAllCountries();
  }

  @Get('countries/:id')
  @ApiOperation({ summary: 'Get country with cities' })
  getCountry(@Param('id', ParseIntPipe) id: number) {
    return this.geo.findCountry(id);
  }

  @Post('countries')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create country (admin)' })
  createCountry(@Body() dto: CreateCountryDto) {
    return this.geo.createCountry(dto);
  }

  @Patch('countries/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update country (admin)' })
  updateCountry(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCountryDto) {
    return this.geo.updateCountry(id, dto);
  }

  // ── Cities ─────────────────────────────────────────────────────────────────

  @Get('cities')
  @ApiOperation({ summary: 'List cities, optionally filtered by countryId' })
  @ApiQuery({ name: 'countryId', required: false, type: Number })
  listCities(@Query('countryId') countryId?: string) {
    return this.geo.findAllCities(countryId ? Number(countryId) : undefined);
  }

  @Get('cities/:slug')
  @ApiOperation({ summary: 'Get city by slug with published clinic count' })
  getCityBySlug(@Param('slug') slug: string) {
    return this.geo.findCityBySlug(slug);
  }

  @Post('cities')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create city (admin)' })
  createCity(@Body() dto: CreateCityDto) {
    return this.geo.createCity(dto);
  }

  @Patch('cities/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update city (admin)' })
  updateCity(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCityDto) {
    return this.geo.updateCity(id, dto);
  }
}
