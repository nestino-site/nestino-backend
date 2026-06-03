import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StartInterviewDto } from '../dto/start-interview.dto';
import { SubmitAnswerDto } from '../dto/submit-answer.dto';
import { randomUUID } from 'crypto';

function normalizeAnswer(type: string, valueNum?: number, valueText?: string): number | null {
  switch (type) {
    case 'LIKERT':
      // 1-5 → 0-100
      return valueNum != null ? Math.round(((valueNum - 1) / 4) * 100) : null;
    case 'NUMBER':
      return null; // raw numbers are stored as-is, not converted to 0-100
    case 'YES_NO':
      if (valueText?.toLowerCase() === 'yes') return 100;
      if (valueText?.toLowerCase() === 'no') return 0;
      return null;
    case 'CHOICE':
      return null; // choices scored manually or per-question
    default:
      return null;
  }
}

@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Start an interview session ────────────────────────────────────────────

  async startInterview(dto: StartInterviewDto) {
    if (!dto.consentGiven) {
      throw new BadRequestException('Patient consent is required to start an interview');
    }

    const clinic = await this.prisma.clinic.findUnique({ where: { id: dto.clinicId } });
    if (!clinic) throw new NotFoundException(`Clinic ${dto.clinicId} not found`);

    const aiSessionId = randomUUID();

    const interview = await this.prisma.patientInterview.create({
      data: {
        clinicId: dto.clinicId,
        language: dto.language ?? 'en',
        ageBucket: dto.ageBucket,
        originCountry: dto.originCountry,
        treatmentCode: dto.treatmentCode,
        completedYear: dto.completedYear,
        status: 'DRAFT',
        consentGiven: true,
        consentTimestamp: new Date(),
        aiSessionId,
      },
    });

    // Return the question catalog for this interview session
    const questions = await this.prisma.interviewQuestion.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return { interview, questions, aiSessionId };
  }

  // ── Submit an answer ──────────────────────────────────────────────────────

  async submitAnswer(interviewId: number, dto: SubmitAnswerDto) {
    const interview = await this.prisma.patientInterview.findUnique({ where: { id: interviewId } });
    if (!interview) throw new NotFoundException(`Interview ${interviewId} not found`);
    if (interview.status !== 'DRAFT') {
      throw new BadRequestException(`Interview is ${interview.status} and cannot accept new answers`);
    }

    const question = await this.prisma.interviewQuestion.findUnique({ where: { code: dto.questionCode } });
    if (!question) throw new NotFoundException(`Question '${dto.questionCode}' not found`);

    const scoredValue = normalizeAnswer(question.type, dto.valueNum, dto.valueText);

    return this.prisma.interviewAnswer.upsert({
      where: { interviewId_questionCode: { interviewId, questionCode: dto.questionCode } },
      create: {
        interviewId,
        questionCode: dto.questionCode,
        dimensionCode: question.dimensionCode,
        valueNum: dto.valueNum,
        valueText: dto.valueText,
        scoredValue,
      },
      update: {
        valueNum: dto.valueNum,
        valueText: dto.valueText,
        scoredValue,
      },
    });
  }

  // ── Finalize / submit for review ──────────────────────────────────────────

  async finalizeInterview(interviewId: number) {
    const interview = await this.prisma.patientInterview.findUnique({
      where: { id: interviewId },
      include: { answers: true },
    });
    if (!interview) throw new NotFoundException(`Interview ${interviewId} not found`);
    if (interview.status !== 'DRAFT') {
      throw new BadRequestException(`Interview is already ${interview.status}`);
    }

    const answerCount = interview.answers.length;
    if (answerCount < 5) {
      throw new BadRequestException(`At least 5 answers required to submit (got ${answerCount})`);
    }

    return this.prisma.patientInterview.update({
      where: { id: interviewId },
      data: { status: 'IN_REVIEW' },
    });
  }

  // ── Admin: verify and publish ─────────────────────────────────────────────

  async verifyInterview(interviewId: number, verifiedBy: string) {
    const interview = await this.prisma.patientInterview.findUnique({ where: { id: interviewId } });
    if (!interview) throw new NotFoundException(`Interview ${interviewId} not found`);

    return this.prisma.patientInterview.update({
      where: { id: interviewId },
      data: { status: 'VERIFIED', verifiedBy, verifiedAt: new Date() },
    });
  }

  async publishInterview(interviewId: number) {
    const interview = await this.prisma.patientInterview.findUnique({ where: { id: interviewId } });
    if (!interview) throw new NotFoundException(`Interview ${interviewId} not found`);
    if (interview.status !== 'VERIFIED') {
      throw new BadRequestException('Interview must be VERIFIED before publishing');
    }

    return this.prisma.patientInterview.update({
      where: { id: interviewId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }

  async rejectInterview(interviewId: number) {
    const interview = await this.prisma.patientInterview.findUnique({ where: { id: interviewId } });
    if (!interview) throw new NotFoundException(`Interview ${interviewId} not found`);
    return this.prisma.patientInterview.update({
      where: { id: interviewId },
      data: { status: 'REJECTED' },
    });
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  listQuestions() {
    return this.prisma.interviewQuestion.findMany({
      where: { isActive: true },
      orderBy: [{ dimensionCode: 'asc' }, { sortOrder: 'asc' }],
      include: { dimension: true },
    });
  }

  listInterviews(clinicId?: number, status?: string) {
    return this.prisma.patientInterview.findMany({
      where: {
        ...(clinicId ? { clinicId } : {}),
        ...(status ? { status: status as 'PUBLISHED' } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInterview(id: number) {
    const interview = await this.prisma.patientInterview.findUnique({
      where: { id },
      include: { answers: { include: { question: true } } },
    });
    if (!interview) throw new NotFoundException(`Interview ${id} not found`);
    return interview;
  }
}
