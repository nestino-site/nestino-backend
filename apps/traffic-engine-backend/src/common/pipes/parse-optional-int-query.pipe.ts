import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

/** Parses optional query-string integers; treats missing/blank as undefined. */
@Injectable()
export class ParseOptionalIntQueryPipe implements PipeTransform<
  string | undefined,
  number | undefined
> {
  transform(value: string | undefined): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      throw new BadRequestException(`Validation failed (numeric string is expected)`);
    }

    return parsed;
  }
}

export const parseOptionalIntQuery = new ParseOptionalIntQueryPipe();
