import type { TConstValue } from '@venizia/ignis-helpers/common';

/** The side of a `one` relation a declaration resolves to. */
export class OneRelationSides {
  /** Carries fields and references - written, or read off this table's foreign key. */
  static readonly OWNING = 'owning';
  /** Carries nothing: the key is on the target, and drizzle pairs this side from there. */
  static readonly INVERSE = 'inverse';

  static readonly SCHEME_SET = new Set<string>([this.OWNING, this.INVERSE]);

  static isValid(value: string): value is TOneRelationSide {
    return this.SCHEME_SET.has(value);
  }
}

export type TOneRelationSide = TConstValue<typeof OneRelationSides>;
