import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AddMediaDto } from '../dto/add-media.dto';

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  findForClinic(clinicId: number) {
    return this.prisma.clinicMedia.findMany({
      where: { clinicId },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async add(clinicId: number, dto: AddMediaDto) {
    if (dto.isPrimary) {
      // Clear existing primary flag for same kind
      await this.prisma.clinicMedia.updateMany({
        where: { clinicId, kind: dto.kind, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return this.prisma.clinicMedia.create({ data: { clinicId, ...dto } });
  }

  async update(clinicId: number, mediaId: number, dto: Partial<AddMediaDto>) {
    const media = await this.prisma.clinicMedia.findFirst({ where: { id: mediaId, clinicId } });
    if (!media) throw new NotFoundException(`Media ${mediaId} not found on clinic ${clinicId}`);

    if (dto.isPrimary) {
      await this.prisma.clinicMedia.updateMany({
        where: { clinicId, kind: media.kind, isPrimary: true, id: { not: mediaId } },
        data: { isPrimary: false },
      });
    }
    return this.prisma.clinicMedia.update({ where: { id: mediaId }, data: dto });
  }

  async remove(clinicId: number, mediaId: number) {
    const media = await this.prisma.clinicMedia.findFirst({ where: { id: mediaId, clinicId } });
    if (!media) throw new NotFoundException(`Media ${mediaId} not found on clinic ${clinicId}`);
    await this.prisma.clinicMedia.delete({ where: { id: mediaId } });
  }

  async reorder(clinicId: number, orderedIds: number[]) {
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.clinicMedia.updateMany({
          where: { id, clinicId },
          data: { displayOrder: index },
        }),
      ),
    );
    return this.findForClinic(clinicId);
  }
}
