import type { TConstValue } from '@venizia/ignis-helpers/common';

/** The writes the row scope holds a payload to: CREATE and UPDATE. */
export class ScopeWriteOperations {
  static readonly CREATE = 'create';
  static readonly UPDATE = 'update';

  static readonly SCHEME_SET = new Set<string>([this.CREATE, this.UPDATE]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid scope write operation values. */
export type TScopeWriteOperation = TConstValue<typeof ScopeWriteOperations>;
