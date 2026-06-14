import { BadRequestException } from '@nestjs/common';
import { ParseOptionalIntQueryPipe } from './parse-optional-int-query.pipe';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const pipe = new ParseOptionalIntQueryPipe();

assert(pipe.transform(undefined) === undefined, 'undefined -> undefined');
assert(pipe.transform('') === undefined, 'empty -> undefined');
assert(pipe.transform('0') === 0, 'zero');
assert(pipe.transform('2') === 2, 'two');

let threw = false;
try {
  pipe.transform('abc');
} catch (error) {
  threw = error instanceof BadRequestException;
}
assert(threw, 'non-numeric throws BadRequestException');

console.log('parse-optional-int-query.pipe.spec.ts: all assertions passed');
