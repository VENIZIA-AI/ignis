import { TConstValue } from '@venizia/ignis-helpers';

/** Engine-neutral field type vocabulary for the search-collection DSL. */
export class SearchFieldTypes {
  static readonly STRING = 'string';
  static readonly NUMBER = 'number';
  static readonly BOOLEAN = 'boolean';
  static readonly GEOPOINT = 'geopoint';
  static readonly STRING_ARRAY = 'string[]';
  static readonly NUMBER_ARRAY = 'number[]';
  static readonly BOOLEAN_ARRAY = 'boolean[]';

  static readonly SCHEME_SET = new Set<string>([
    this.STRING,
    this.NUMBER,
    this.BOOLEAN,
    this.GEOPOINT,
    this.STRING_ARRAY,
    this.NUMBER_ARRAY,
    this.BOOLEAN_ARRAY,
  ]);

  static isValid(value: string): value is TSearchFieldType {
    return this.SCHEME_SET.has(value);
  }
}

export type TSearchFieldType = TConstValue<typeof SearchFieldTypes>;

export interface ISearchFieldDefinition {
  name: string;
  type: TSearchFieldType;
  searchable?: boolean;
  filterable?: boolean;
  facet?: boolean;
  sortable?: boolean;
  optional?: boolean;
}

/** Per-field builder flags accepted by `field.*` helpers (src/connectors/typesense/models/define-search-collection.ts). */
export type TFieldFlags = Pick<
  ISearchFieldDefinition,
  'searchable' | 'filterable' | 'facet' | 'sortable' | 'optional'
>;

export interface ISearchCollectionDefinition {
  name: string;
  fields: readonly ISearchFieldDefinition[];
  defaultSort?: string;
  // Known engines get a named, documented key; the index signature admits any other engine
  // (e.g. a third-party or in-house driver) without widening the known keys' value types.
  engineOverrides?: {
    typesense?: object;
    meilisearch?: object;
    opensearch?: object;
    elasticsearch?: object;
  } & { [engine: string]: object | undefined };
}

export type TSearchSchema = Record<string, ISearchCollectionDefinition>;

/** Maps a DSL field-type literal to its TypeScript runtime type - the scalar/array counterpart of `TSearchFieldType`. */
export type TSearchFieldTsType<T extends TSearchFieldType> = T extends 'string'
  ? string
  : T extends 'number'
    ? number
    : T extends 'boolean'
      ? boolean
      : T extends 'geopoint'
        ? [number, number]
        : T extends 'string[]'
          ? string[]
          : T extends 'number[]'
            ? number[]
            : T extends 'boolean[]'
              ? boolean[]
              : never;

/**
 * Compile-time document shape for a `defineSearchCollection` literal - the search-branch parity to postgres's `typeof User.schema` inference.
 * Uses `Exclude<T['fields'][number], { optional: true }>` rather than `Extract<..., { optional?: false }>`: the latter is a TS "weak type" and rejects field literals with no `optional` key at all.
 */
export type TInferSearchDocument<T extends ISearchCollectionDefinition> = { id: string } & {
  [F in Exclude<T['fields'][number], { optional: true }> as F['name'] extends 'id'
    ? never
    : F['name']]: TSearchFieldTsType<F['type']>;
} & {
  [F in Extract<T['fields'][number], { optional: true }> as F['name'] extends 'id'
    ? never
    : F['name']]?: TSearchFieldTsType<F['type']>;
};
