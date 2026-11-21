import type { TConstValue } from '@venizia/ignis-helpers/common';
import { ConstClass } from '@venizia/ignis-helpers/common';

/** The side of a `one` relation a declaration resolves to. */
export class OneRelationSides extends ConstClass {
  /** Carries fields and references - written, or read off this table's foreign key. */
  static readonly OWNING = 'owning';
  /** Carries nothing: the key is on the target, and drizzle pairs this side from there. */
  static readonly INVERSE = 'inverse';
}

export type TOneRelationSide = TConstValue<typeof OneRelationSides>;
