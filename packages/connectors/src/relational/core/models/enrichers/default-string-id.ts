import { UuidHelper } from '@venizia/ignis-helpers/core';

/** The id generator of a text primary key, for both dialects. */
export class DefaultStringId {
  /** Time-ordered, so a text primary key appends to its B-tree instead of splitting pages. */
  static readonly generate = (): string => UuidHelper.getInstance().v7();
}
