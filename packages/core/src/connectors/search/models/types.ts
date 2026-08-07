import type { TConstValue } from '@venizia/ignis-helpers';

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

/** Embedding-model config for a server-side auto-embedded vector field: built-in models need only `name`, remote providers add `apiKey` and/or auth fields, and compilers map these camelCase keys to wire vocabulary. Source secrets from env - never hardcode them into a committed schema. */
export interface ISearchEmbedModelConfig {
  /** Built-in (`ts/...`) or remote (`openai/...`, `google/...`, `azure/...`). */
  name: string;
  /** Remote providers (OpenAI, Google, Azure). */
  apiKey?: string;
  /** Azure / self-hosted endpoints. */
  url?: string;
  // GCP Vertex AI auth.
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  projectId?: string;
  /** Escape for any provider field not modeled above; pass it already in the target engine's wire form. */
  [key: string]: unknown;
}

export interface ISearchEmbedConfig {
  from: string[];
  model: ISearchEmbedModelConfig;
}

export interface ISearchFieldDefinition {
  name: string;
  type: TSearchFieldType;
  searchable?: boolean;
  filterable?: boolean;
  facet?: boolean;
  sortable?: boolean;
  optional?: boolean;
  vector?: { dimensions?: number; distance?: TVectorDistance; embed?: ISearchEmbedConfig };
}

/** Per-field builder flags accepted by `field.*` helpers (./define-search-collection.ts). */
export type TFieldFlags = Pick<
  ISearchFieldDefinition,
  'searchable' | 'filterable' | 'facet' | 'sortable' | 'optional'
>;

/** A synonym set. `root` set = one-way (query for root also matches synonyms); absent = multi-way (all interchangeable). */
export interface ISynonym {
  id: string;
  synonyms: string[];
  root?: string;
}

export interface ISearchCollectionDefinition {
  name: string;
  fields: readonly ISearchFieldDefinition[];
  defaultSort?: string;
  defaultQueryBy?: string[];

  /** Declarative synonym sets provisioned alongside the collection (see `BaseSearchDataSource.provisionCollections`). */
  synonyms?: ISynonym[];

  // Known engines get a named key; the index signature admits any third-party or in-house connector without widening the known keys' value types.
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
              : T extends 'vector'
                ? number[]
                : never;

/** Compile-time document shape for a `defineSearchCollection` literal. Uses `Exclude<..., { optional: true }>`, not `Extract<..., { optional?: false }>` - the latter is a TS weak type and rejects fields with no `optional` key. A `vector.embed` field is server auto-embedded, so it is omitted entirely. */
export type TSearchDocument<T extends ISearchCollectionDefinition> = { id: string } & {
  [
    F in Exclude<T['fields'][number], { optional: true }> as F['name'] extends 'id'
      ? never
      : F extends { vector: { embed: object } }
        ? never
        : F['name']
  ]: TSearchFieldTsType<F['type']>;
} & {
  [
    F in Extract<T['fields'][number], { optional: true }> as F['name'] extends 'id'
      ? never
      : F extends { vector: { embed: object } }
        ? never
        : F['name']
  ]?: TSearchFieldTsType<F['type']>;
};
