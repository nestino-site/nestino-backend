import { Injectable, NotFoundException } from '@nestjs/common';
import { PipelineStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class ContentStateManagerService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(pageId: number) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: {
        site: true,
        aiGenerationLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }
    return page;
  }

  async updateStatus(pageId: number, status: PipelineStatus): Promise<void> {
    await this.prisma.page.update({
      where: { id: pageId },
      data: { pipelineStatus: status },
    });
  }
}
