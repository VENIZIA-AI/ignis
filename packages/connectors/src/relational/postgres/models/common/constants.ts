import type { TConstValue } from '@venizia/ignis-helpers/common';
import { ConstClass } from '@venizia/ignis-helpers/common';

/** How a `big-number` id column is read back: as a JavaScript NUMBER or as a BIGINT (drizzle's `bigint` column `mode`). */
export class BigIntModes extends ConstClass {
  static readonly NUMBER = 'number';
  static readonly BIGINT = 'bigint';
}

/** Valid big-number id mode values. */
export type TBigIntMode = TConstValue<typeof BigIntModes>;
