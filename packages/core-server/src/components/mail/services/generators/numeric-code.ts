import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import type { IVerificationCodeGenerator } from '../../common';

/** `crypto.randomInt` draws a 48-bit value; the same width keeps the same range (`max` up to 2 ** 48). */
const DRAW_BYTES = 6;
const DRAW_RANGE = 2 ** (DRAW_BYTES * 8);

export class NumericCodeGenerator extends BaseHelper implements IVerificationCodeGenerator {
  constructor() {
    super({ scope: NumericCodeGenerator.name });
  }

  generateCode(length: number): string {
    const max = Math.pow(10, length);
    const code = NumericCodeGenerator.getRandomBelow({ max });
    return code.toString().padStart(length, '0');
  }

  /**
   * A uniform integer in `[0, max)`. A draw at or above the largest multiple of `max` is thrown away and drawn
   * again, so no code is likelier than another (`value % max` alone favours the low codes).
   */
  private static getRandomBelow(opts: { max: number }): number {
    const { max } = opts;

    if (!Number.isSafeInteger(max) || max <= 0 || max > DRAW_RANGE) {
      throw getError({
        message: `[NumericCodeGenerator][generateCode] Invalid length | 10 ** length must be an integer from 1 to ${DRAW_RANGE} | Got: ${max}`,
      });
    }

    const limit = DRAW_RANGE - (DRAW_RANGE % max);
    for (;;) {
      const bytes = crypto.getRandomValues(new Uint8Array(DRAW_BYTES));
      let value = 0;
      for (const byte of bytes) {
        value = value * 256 + byte;
      }

      if (value < limit) {
        return value % max;
      }
    }
  }
}
