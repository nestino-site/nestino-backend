import {
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

const logger = new Logger('PrismaErrorMapper');

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
      if (error.code === 'P2011') {
        return new UnprocessableEntityException('Null value on required field.');
      }
      if (error.code === 'P2004') {
        return new UnprocessableEntityException('Database constraint failed.');
      }
      logger.error({
        msg: 'unhandled_prisma_known_error',
        code: error.code,
        meta: error.meta,
        message: error.message,
      });
    } else if (error instanceof Prisma.PrismaClientUnknownRequestError) {
      logger.error({
        msg: 'prisma_unknown_request_error',
        message: error.message,
      });
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      logger.error({
        msg: 'prisma_validation_error',
        message: error.message,
      });
      return new UnprocessableEntityException('Invalid data provided to database.');
    }

    return new InternalServerErrorException('Unexpected database error.');
  }
}
