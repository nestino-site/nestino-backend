import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

@Injectable()
export class TreatmentSlugGuard {
  constructor(private readonly prisma: PrismaService) {}

  async assertNotTreatmentSlug(candidateSlug: string, entityLabel: string): Promise<void> {
    const normalized = candidateSlug.toLowerCase().trim();
    const treatments = await this.prisma.treatment.findMany({
      where: { isActive: true },
      select: { name: true, code: true },
    });

    for (const treatment of treatments) {
      const treatmentSlug = slugify(treatment.name);
      if (treatmentSlug === normalized || slugify(treatment.code) === normalized) {
        throw new BadRequestException(
          `${entityLabel} slug '${candidateSlug}' conflicts with reserved treatment slug '${treatmentSlug}'`,
        );
      }
    }
  }
}
