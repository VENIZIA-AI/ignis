import type { AnyType, IConfigurable, TClass, TConstValue } from '@venizia/ignis-helpers';

export class DataSourceDrivers {
  // Relational
  static readonly NODE_POSTGRES = 'node-postgres';
  static readonly POSTGRES_JS = 'postgres-js';

  // Search
  static readonly TYPESENSE = 'typesense';
  static readonly MEILISEARCH = 'meilisearch';

  static readonly RELATIONAL_SCHEME_SET = new Set([this.NODE_POSTGRES, this.POSTGRES_JS]);
  static readonly SEARCH_SCHEME_SET = new Set([this.TYPESENSE, this.MEILISEARCH]);

  static readonly SCHEME_SET = new Set([
    // Relational
    this.NODE_POSTGRES,
    this.POSTGRES_JS,

    // Search
    this.TYPESENSE,
    this.MEILISEARCH,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

// `(string & {})` keeps autocomplete for the known DataSourceDrivers values while still accepting
// any other engine-driver string literal (e.g. a third-party or in-house driver name).
export type TDataSourceDriver = TConstValue<typeof DataSourceDrivers> | (string & {});

/** A driver CLASS, named by `@datasource({ driver })` - the class reference is what carries the
 * peer package into the bundle (a name string carries nothing, and a bare side-effect import may be
 * deleted by a bundler). Untyped: `IRelationalDriver` lives under `connectors/`, off-limits to `base/`. */
export type TDataSourceDriverClass = TClass<AnyType>;

export type TAnyDataSourceSchema = Record<string, any>;

/** Engine-neutral datasource contract - the root every connector family implements. */
export interface IDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
> extends IConfigurable<ConfigurableOptions> {
  name: string;
  settings: Settings;
  schema: Schema;

  getSettings(): Settings;
  getSchema(): Schema;
}

/** Neutral transaction options. Isolation levels are engine vocabulary, so `isolationLevel` stays a
 * loose string here; connectors narrow it in their own `ITransactionOptions` extension. */
export interface ITransactionOptions {
  isolationLevel?: string;
}

/** Neutral transaction handle - the minimum shape every connector's transaction satisfies. */
export interface ITransaction {
  isActive: boolean;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface IDataSourceCapabilities {
  transactions: boolean;
}

export interface ISearchableDataSourceCapabilities extends IDataSourceCapabilities {
  search?: {
    /** Vector / semantic / hybrid search (search engines). */
    vector?: boolean;

    /** Batched multi-query search across collections. */
    multi?: boolean;

    /** Merged (union) result set across a multi-search. */
    union?: boolean;

    /** Synonym sets (multi-way / one-way). */
    synonyms?: boolean;
  };
}
