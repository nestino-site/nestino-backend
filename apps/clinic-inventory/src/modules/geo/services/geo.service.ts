import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreateCountryDto } from '../dto/create-country.dto';
import { CreateCityDto } from '../dto/create-city.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Countries ──────────────────────────────────────────────────────────────

  findAllCountries() {
    return this.prisma.country.findMany({ orderBy: { name: 'asc' } });
  }

  async findCountry(id: number) {
    const country = await this.prisma.country.findUnique({ where: { id }, include: { cities: { orderBy: { name: 'asc' } } } });
    if (!country) throw new NotFoundException(`Country ${id} not found`);
    return country;
  }

  async createCountry(dto: CreateCountryDto) {
    try {
      return await this.prisma.country.create({ data: dto });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Country with code ${dto.codeIso2} already exists`);
      }
      throw e;
    }
  }

  async updateCountry(id: number, dto: Partial<CreateCountryDto>) {
    await this.findCountry(id);
    return this.prisma.country.update({ where: { id }, data: dto });
  }

  // ── Cities ─────────────────────────────────────────────────────────────────

  findAllCities(countryId?: number) {
    return this.prisma.city.findMany({
      where: countryId ? { countryId } : undefined,
      include: {
        country: { select: { codeIso2: true, name: true } },
        _count: { select: { clinics: { where: { status: 'PUBLISHED' } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findCityBySlug(slug: string) {
    const city = await this.prisma.city.findUnique({
      where: { slug },
      include: {
        country: true,
        _count: { select: { clinics: { where: { status: 'PUBLISHED' } } } },
      },
    });
    if (!city) throw new NotFoundException(`City '${slug}' not found`);
    return city;
  }

  async findCity(id: number) {
    const city = await this.prisma.city.findUnique({
      where: { id },
      include: { country: true },
    });
    if (!city) throw new NotFoundException(`City ${id} not found`);
    return city;
  }

  async createCity(dto: CreateCityDto) {
    try {
      return await this.prisma.city.create({
        data: {
          ...dto,
          lat: dto.lat !== undefined ? dto.lat : undefined,
          lng: dto.lng !== undefined ? dto.lng : undefined,
        },
        include: { country: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`City with slug '${dto.slug}' already exists`);
      }
      throw e;
    }
  }

  async updateCity(id: number, dto: Partial<CreateCityDto>) {
    await this.findCity(id);
    return this.prisma.city.update({ where: { id }, data: dto, include: { country: true } });
  }
}
