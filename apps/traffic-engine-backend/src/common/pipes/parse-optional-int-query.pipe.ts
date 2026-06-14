import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

function parseOptionalIntValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }

  if (typeof raw === 'number') {
    return Number.isInteger(raw) ? raw : undefined;
  }

  const parsed = Number.parseInt(String(raw), 10);
  if (Number.isNaN(parsed)) {
    throw new BadRequestException('Validation failed (numeric string is expected)');
  }

  return parsed;
}

/** Parses optional query-string integers; treats missing/blank as undefined. */
@Injectable()
export class ParseOptionalIntQueryPipe implements PipeTransform<
  unknown,
  number | undefined
> {
  transform(value: unknown): number | undefined {
    return parseOptionalIntValue(value);
  }
}

export const parseOptionalIntQuery = new ParseOptionalIntQueryPipe();

export function parseOptionalIntQueryParam(value?: string): number | undefined {
  return parseOptionalIntValue(value);
}
