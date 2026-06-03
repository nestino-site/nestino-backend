import {
  Controller, Get, Post, Patch, Param, Body, ParseIntPipe, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { GeoService } from '../services/geo.service';
import { CreateCountryDto, UpdateCountryDto } from '../dto/create-country.dto';
import { CreateCityDto, UpdateCityDto } from '../dto/create-city.dto';
import { Public } from '../../../identity/decorators/public.decorator';

@ApiTags('Geo')
@Controller()
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('countries')
  @Public()
  @ApiOperation({ summary: 'List all countries' })
  listCountries() {
    return this.geo.findAllCountries();
  }

  @Get('countries/:id')
  @Public()
  @ApiOperation({ summary: 'Get country with cities' })
  getCountry(@Param('id', ParseIntPipe) id: number) {
    return this.geo.findCountry(id);
  }

  @Post('countries')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create country (admin)' })
  createCountry(@Body() dto: CreateCountryDto) {
    return this.geo.createCountry(dto);
  }

  @Patch('countries/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update country (admin)' })
  updateCountry(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCountryDto) {
    return this.geo.updateCountry(id, dto);
  }

  @Get('cities')
  @Public()
  @ApiOperation({ summary: 'List cities, optionally filtered by countryId' })
  @ApiQuery({ name: 'countryId', required: false, type: Number })
  listCities(@Query('countryId') countryId?: string) {
    return this.geo.findAllCities(countryId ? Number(countryId) : undefined);
  }

  @Get('cities/:slug')
  @Public()
  @ApiOperation({ summary: 'Get city by slug with published clinic count' })
  getCityBySlug(@Param('slug') slug: string) {
    return this.geo.findCityBySlug(slug);
  }

  @Post('cities')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create city (admin)' })
  createCity(@Body() dto: CreateCityDto) {
    return this.geo.createCity(dto);
  }

  @Patch('cities/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update city (admin)' })
  updateCity(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCityDto) {
    return this.geo.updateCity(id, dto);
  }
}
