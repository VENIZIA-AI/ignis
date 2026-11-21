import type { TConstValue } from '@venizia/ignis-helpers/common';
import { ConstClass } from '@venizia/ignis-helpers/common';

/** Engine-neutral field type vocabulary for the search-collection DSL. */
export class SearchFieldTypes extends ConstClass {
  static readonly STRING = 'string';
  static readonly NUMBER = 'number';
  static readonly BOOLEAN = 'boolean';
  static readonly GEOPOINT = 'geopoint';
  static readonly STRING_ARRAY = 'string[]';
  static readonly NUMBER_ARRAY = 'number[]';
  static readonly BOOLEAN_ARRAY = 'boolean[]';
  static readonly VECTOR = 'vector';

  /** Full-text search matches text fields only (`string`, `string[]`): the rule `defaultQueryBy` and a route's `query.queryBy` share. */
  static isText(type: string): boolean {
    return type === this.STRING || type === this.STRING_ARRAY;
  }
}

/** Union of the `SearchFieldTypes` values. */
export type TSearchFieldType = TConstValue<typeof SearchFieldTypes>;

/** Distance metrics a `vector` field may declare. An engine that supports fewer rejects the rest in its compiler. */
export class VectorDistances extends ConstClass {
  static readonly COSINE = 'cosine';
  static readonly INNER_PRODUCT = 'ip';
  static readonly L2 = 'l2';
}

/** Union of the `VectorDistances` values: `'cosine'`, `'ip'` or `'l2'`. */
export type TVectorDistance = TConstValue<typeof VectorDistances>;
