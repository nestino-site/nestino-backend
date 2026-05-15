import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ContentLanguage,
  HallucinationSensitivity,
  KeywordIntent,
  Prisma,
  RiskCategory,
  Subject,
  SubjectStatus,
} from '@prisma/client';
import { PrismaErrorMapper } from '../../../../common/errors/prisma-error.mapper';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { CreateSubjectDto } from '../dto/create-subject.dto';
import { UpdateSubjectDto } from '../dto/update-subject.dto';

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSubjectDto): Promise<Subject> {
    try {
      return await this.prisma.subject.create({
        data: {
          siteId: dto.siteId,
          templateId: dto.templateId,
          pillarPageId: dto.pillarPageId,
          title: dto.title,
          description: dto.description,
          primaryKeywords: dto.primaryKeywords,
          secondaryKeywords: dto.secondaryKeywords ?? [],
          searchIntent: dto.searchIntent ?? KeywordIntent.INFORMATIONAL,
          language: dto.language ?? ContentLanguage.EN,
          country: dto.country,
          city: dto.city,
          seoGoal: dto.seoGoal,
          contentCountTarget: dto.contentCountTarget ?? 10,
          hallucinationSensitivity:
            dto.hallucinationSensitivity ?? HallucinationSensitivity.MEDIUM,
          riskCategory: dto.riskCategory ?? RiskCategory.GENERAL,
          requiresFactualValidation: dto.requiresFactualValidation ?? false,
          strictReviewMode: dto.strictReviewMode ?? false,
          status: dto.status ?? SubjectStatus.ACTIVE,
        },
        include: { template: true },
      });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }

  async findAll(siteId?: number, status?: SubjectStatus): Promise<Subject[]> {
    const where: Prisma.SubjectWhereInput = {};
    if (siteId) {
      where.siteId = siteId;
    }
    if (status) {
      where.status = status;
    }
    return this.prisma.subject.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { template: true },
    });
  }

  async findOne(id: number): Promise<Subject> {
    const subject = await this.prisma.subject.findUnique({
      where: { id },
      include: { template: true, _count: { select: { contentIdeas: true } } },
    });
    if (!subject) {
      throw new NotFoundException(`Subject ${id} not found`);
    }
    return subject;
  }

  async update(id: number, dto: UpdateSubjectDto): Promise<Subject> {
    await this.findOne(id);
    try {
      return await this.prisma.subject.update({
        where: { id },
        data: {
          siteId: dto.siteId,
          templateId: dto.templateId,
          pillarPageId: dto.pillarPageId,
          title: dto.title,
          description: dto.description,
          primaryKeywords: dto.primaryKeywords,
          secondaryKeywords: dto.secondaryKeywords,
          searchIntent: dto.searchIntent,
          language: dto.language,
          country: dto.country,
          city: dto.city,
          seoGoal: dto.seoGoal,
          contentCountTarget: dto.contentCountTarget,
          hallucinationSensitivity: dto.hallucinationSensitivity,
          riskCategory: dto.riskCategory,
          requiresFactualValidation: dto.requiresFactualValidation,
          strictReviewMode: dto.strictReviewMode,
          status: dto.status,
        },
        include: { template: true },
      });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }

  async remove(id: number): Promise<Subject> {
    await this.findOne(id);
    try {
      return await this.prisma.subject.delete({ where: { id } });
    } catch (error) {
      throw PrismaErrorMapper.toHttpException(error);
    }
  }
}
