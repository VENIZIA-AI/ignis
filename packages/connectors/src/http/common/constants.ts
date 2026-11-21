import type { TConstValue } from '@venizia/ignis-helpers/common';

/** What a read expects back: LIST (a bare array or the `{ count, data }` envelope) or ONE (a single record, never unwrapped). */
export class HttpReadShapes {
  static readonly LIST = 'list';
  static readonly ONE = 'one';

  static readonly SCHEME_SET = new Set<string>([this.LIST, this.ONE]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid HTTP read shape values. */
export type THttpReadShape = TConstValue<typeof HttpReadShapes>;
