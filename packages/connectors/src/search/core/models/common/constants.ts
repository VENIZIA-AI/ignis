import type { TConstValue } from '@venizia/ignis-helpers/common';

/** Engine-neutral field type vocabulary for the search-collection DSL. */
export class SearchFieldTypes {
  static readonly STRING = 'string';
  static readonly NUMBER = 'number';
  static readonly BOOLEAN = 'boolean';
  static readonly GEOPOINT = 'geopoint';
  static readonly STRING_ARRAY = 'string[]';
  static readonly NUMBER_ARRAY = 'number[]';
  static readonly BOOLEAN_ARRAY = 'boolean[]';
  static readonly VECTOR = 'vector';

  static readonly SCHEME_SET = new Set<string>([
    this.STRING,
    this.NUMBER,
    this.BOOLEAN,
    this.GEOPOINT,
    this.STRING_ARRAY,
    this.NUMBER_ARRAY,
    this.BOOLEAN_ARRAY,
    this.VECTOR,
  ]);

  static isValid(value: string): value is TSearchFieldType {
    return this.SCHEME_SET.has(value);
  }
}

export type TSearchFieldType = TConstValue<typeof SearchFieldTypes>;

/** Distance metrics a `vector` field may declare. An engine that supports fewer rejects the rest in its compiler. */
export class VectorDistances {
  static readonly COSINE = 'cosine';
  static readonly INNER_PRODUCT = 'ip';
  static readonly L2 = 'l2';

  static readonly SCHEME_SET = new Set<string>([this.COSINE, this.INNER_PRODUCT, this.L2]);

  static isValid(value: string): value is TVectorDistance {
    return this.SCHEME_SET.has(value);
  }
}

export type TVectorDistance = TConstValue<typeof VectorDistances>;
