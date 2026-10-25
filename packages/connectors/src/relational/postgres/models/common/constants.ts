import type { TConstValue } from '@venizia/ignis-helpers/common';

/** How a `big-number` id column is read back: as a JavaScript NUMBER or as a BIGINT (drizzle's `bigint` column `mode`). */
export class BigIntModes {
  static readonly NUMBER = 'number';
  static readonly BIGINT = 'bigint';

  static readonly SCHEME_SET = new Set<string>([this.NUMBER, this.BIGINT]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid big-number id mode values. */
export type TBigIntMode = TConstValue<typeof BigIntModes>;
