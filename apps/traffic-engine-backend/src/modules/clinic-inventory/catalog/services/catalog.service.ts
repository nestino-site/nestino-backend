import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { CreateTreatmentDto } from '../dto/create-treatment.dto';
import { CreateAccreditationDto } from '../dto/create-accreditation.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Treatments ─────────────────────────────────────────────────────────────

  findAllTreatments(activeOnly = true) {
    return this.prisma.treatment.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findTreatment(code: string) {
    const t = await this.prisma.treatment.findUnique({ where: { code } });
    if (!t) throw new NotFoundException(`Treatment '${code}' not found`);
    return t;
  }

  async createTreatment(dto: CreateTreatmentDto) {
    try {
      return await this.prisma.treatment.create({ data: dto });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Treatment '${dto.code}' already exists`);
      }
      throw e;
    }
  }

  async updateTreatment(code: string, dto: Partial<CreateTreatmentDto>) {
    await this.findTreatment(code);
    return this.prisma.treatment.update({ where: { code }, data: dto });
  }

  // ── Accreditations ─────────────────────────────────────────────────────────

  findAllAccreditations(activeOnly = true) {
    return this.prisma.accreditation.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async findAccreditation(code: string) {
    const a = await this.prisma.accreditation.findUnique({ where: { code } });
    if (!a) throw new NotFoundException(`Accreditation '${code}' not found`);
    return a;
  }

  async createAccreditation(dto: CreateAccreditationDto) {
    try {
      return await this.prisma.accreditation.create({ data: dto });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Accreditation '${dto.code}' already exists`);
      }
      throw e;
    }
  }

  async updateAccreditation(code: string, dto: Partial<CreateAccreditationDto>) {
    await this.findAccreditation(code);
    return this.prisma.accreditation.update({ where: { code }, data: dto });
  }

  // ── Truth Score Dimensions (read-only from API) ───────────────────────────

  findAllDimensions() {
    return this.prisma.truthScoreDimension.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
