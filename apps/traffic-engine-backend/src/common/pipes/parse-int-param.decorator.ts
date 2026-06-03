import { Param, ParseIntPipe } from '@nestjs/common';

/** Path param parsed as a positive integer ID. */
export const ParseIntParam = (name: string) => Param(name, ParseIntPipe);
