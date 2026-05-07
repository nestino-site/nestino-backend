import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

export class PrismaErrorMapper {
  static toHttpException(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return new ConflictException('Unique constraint violated.');
      }
      if (error.code === 'P2025') {
        return new NotFoundException('Requested resource was not found.');
      }
      if (error.code === 'P2003') {
        return new UnprocessableEntityException('Invalid relation reference.');
      }
    }

    return new InternalServerErrorException('Unexpected database error.');
  }
}
