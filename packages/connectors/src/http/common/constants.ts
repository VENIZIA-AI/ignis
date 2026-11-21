import type { TConstValue } from '@venizia/ignis-helpers/common';
import { ConstClass } from '@venizia/ignis-helpers/common';

/** What a read expects back: LIST (a bare array or the `{ count, data }` envelope) or ONE (a single record, never unwrapped). */
export class HttpReadShapes extends ConstClass {
  static readonly LIST = 'list';
  static readonly ONE = 'one';
}

/** Valid HTTP read shape values. */
export type THttpReadShape = TConstValue<typeof HttpReadShapes>;
