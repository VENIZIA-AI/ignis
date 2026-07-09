import type { IConfigurable, TConstValue } from '@venizia/ignis-helpers';

export class DataSourceDrivers {
  static readonly NODE_POSTGRES = 'node-postgres';
  static readonly TYPESENSE = 'typesense';

  static readonly SCHEME_SET = new Set([this.NODE_POSTGRES, this.TYPESENSE]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

// `(string & {})` keeps autocomplete for the known DataSourceDrivers values while still accepting
// any other engine-driver string literal (e.g. a third-party or in-house driver name).
export type TDataSourceDriver = TConstValue<typeof DataSourceDrivers> | (string & {});
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

/**
 * Neutral transaction options. Isolation levels are engine vocabulary (postgres's
 * `READ COMMITTED` / `SERIALIZABLE` / ... are not universal across connectors), so this is kept
 * loose here; connectors narrow `isolationLevel` to their own const-class in their own
 * `ITransactionOptions` extension (e.g. postgres's `IDatabaseTransactionOptions`).
 */
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
  // Options for search engine
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
