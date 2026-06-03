import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentTemplate, ContentType, Prisma } from '@prisma/client';
import { PrismaErrorMapper } from '../../../../common/errors/prisma-error.mapper';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { UpdateTemplateDto } from '../dto/update-template.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTemplateDto): Promise<ContentTemplate> {
    try {
      return await this.prisma.contentTemplate.create({
        data: {
          name: dto.name,
          description: dto.description,
          contentType: dto.contentType ?? ContentType.ARTICLE,
          requiredSections: dto.requiredSections as Prisma.InputJsonValue,
          headingStructure: dto.headingStructure as Prisma.InputJsonValue,
          seoRules: dto.seoRules as Prisma.InputJsonValue,
          faqStructure: dto.faqStructure as Prisma.InputJsonValue,
          ctaPlacement: dto.ctaPlacement,
          internalLinkingRules: dto.internalLinkingRules as Prisma.InputJsonValue | undefined,
          formattingInstructions: dto.formattingInstructions,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }

  async findAll(activeOnly?: boolean): Promise<ContentTemplate[]> {
    return this.prisma.contentTemplate.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number): Promise<ContentTemplate> {
    const template = await this.prisma.contentTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`ContentTemplate ${id} not found`);
    }
    return template;
  }

  async update(id: number, dto: UpdateTemplateDto): Promise<ContentTemplate> {
    await this.findOne(id);
    try {
      return await this.prisma.contentTemplate.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          contentType: dto.contentType,
          requiredSections: dto.requiredSections as Prisma.InputJsonValue | undefined,
          headingStructure: dto.headingStructure as Prisma.InputJsonValue | undefined,
          seoRules: dto.seoRules as Prisma.InputJsonValue | undefined,
          faqStructure: dto.faqStructure as Prisma.InputJsonValue | undefined,
          ctaPlacement: dto.ctaPlacement,
          internalLinkingRules: dto.internalLinkingRules as Prisma.InputJsonValue | undefined,
          formattingInstructions: dto.formattingInstructions,
          isActive: dto.isActive,
        },
      });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }

  async remove(id: number): Promise<ContentTemplate> {
    await this.findOne(id);
    try {
      return await this.prisma.contentTemplate.delete({ where: { id } });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }
}
