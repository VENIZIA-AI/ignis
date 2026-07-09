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

/** Vector distance metrics Typesense supports for a `vector` field's `vec_dist`. */
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

/** Server-side auto-embedding config (Typesense generates + queries embeddings from source fields). */
/**
 * Embedding-model config for an auto-embedded vector field. Two families, one shape:
 * - Local built-in model (runs on the Typesense server, no key): just `name`, e.g. 'ts/all-MiniLM-L6-v2'.
 * - Remote provider (OpenAI/Google/Azure/GCP Vertex): `name` (e.g. 'google/embedding-gecko-001') plus
 *   `apiKey` and/or the provider's auth fields.
 * camelCase here is mapped to Typesense's snake_case `model_config` at compile time. Source `apiKey`
 * and the other secrets from env - never hardcode them into a committed schema.
 */
export interface ISearchEmbedModelConfig {
  /** Maps to Typesense `model_name`. Built-in (`ts/...`) or remote (`openai/...`, `google/...`, `azure/...`). */
  name: string;
  /** Maps to `api_key`. Remote providers (OpenAI, Google, Azure). */
  apiKey?: string;
  /** Maps to `url`. Azure / self-hosted endpoints. */
  url?: string;
  // GCP Vertex AI auth (each maps to its snake_case wire key).
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  projectId?: string;
  /** Escape for any provider field not modeled above; pass it already in Typesense's snake_case form. */
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

/** Per-field builder flags accepted by `field.*` helpers (src/connectors/typesense/models/define-search-collection.ts). */
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

  /** Declarative synonym sets provisioned alongside the collection (see `BaseSearchDataSource.provisionCollections`). */
  synonyms?: ISynonym[];

  // Known engines get a named, documented key; the index signature admits any other engine
  // (e.g. a third-party or in-house connector) without widening the known keys' value types.
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

/**
 * Compile-time document shape for a `defineSearchCollection` literal - the search-branch parity to postgres's `typeof User.schema` inference.
 * Uses `Exclude<T['fields'][number], { optional: true }>` rather than `Extract<..., { optional?: false }>`: the latter is a TS "weak type" and rejects field literals with no `optional` key at all.
 * A vector field carrying `vector.embed` is server auto-embedded - Typesense generates and queries it, so it is omitted entirely from the document shape (neither the required nor optional remap admits it); a vector field without `embed` is client-provided and infers as `number[]`.
 */
export type TSearchDocument<T extends ISearchCollectionDefinition> = { id: string } & {
  [F in Exclude<T['fields'][number], { optional: true }> as F['name'] extends 'id'
    ? never
    : F extends { vector: { embed: object } }
      ? never
      : F['name']]: TSearchFieldTsType<F['type']>;
} & {
  [F in Extract<T['fields'][number], { optional: true }> as F['name'] extends 'id'
    ? never
    : F extends { vector: { embed: object } }
      ? never
      : F['name']]?: TSearchFieldTsType<F['type']>;
};
