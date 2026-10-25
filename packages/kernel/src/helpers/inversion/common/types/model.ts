import type { AbstractEntity } from '@/base/models';
import type {
  ScopeFilters,
  TFilter,
  TScopeFilterMissingBehavior,
  TScopeWriteGuard,
  TWhere,
} from '@/base/repositories';
import type { TClass, TNullable, TValueOrResolver } from '@venizia/ignis-helpers/common';
import type { IArtifactRegistrationOptions } from './artifact';

export interface IModelAuthorizeSettings {
  /** The authorization principal name (resource/subject) for this model. */
  principal: string;
  /** Extensible - consumers can add any extra authorization metadata. */
  [extra: string | symbol]: any;
}

/**
 * Row-scope resolver for `@model` settings.scopeFilter - resolved per query, so it can depend on
 * the current request (tenant, org, membership). Framework-internal escape hatches aside, nothing
 * short of removing this setting from the model turns scoping off.
 */
export interface IScopeFilterSettings {
  /**
   * Returns the scope `where`; `ScopeFilters.UNRESTRICTED` to apply no scope for THIS call (an
   * internal operator, a caller the application has decided sees everything); or null/undefined
   * when this caller's scope cannot be determined at all.
   */
  resolve: () => TNullable<TWhere> | typeof ScopeFilters.UNRESTRICTED;

  /**
   * What `applyScopeFilter` does when `resolve()` returns null/undefined - no request context, no
   * tenant, a background job. Defaults to `deny`: an unresolved scope matches zero rows, never
   * every row. `allow` is an explicit, reviewed opt-out for migrations and background jobs, declared
   * per MODEL - it cannot express a per-USER bypass; use `ScopeFilters.UNRESTRICTED` for that.
   */
  onMissing?: TScopeFilterMissingBehavior;

  /**
   * What a create, createAll or an update payload that names a scope column does when its value
   * disagrees with the resolved scope. `reject` (default) refuses the write and writes nothing - for
   * `createAll` not even the valid rows. `assign` also fills a scope column that is ABSENT from a
   * created row, when the scope is a single equality; a value that is present and disagrees is
   * still refused.
   *
   * The scope's columns and allowed values are read from the resolved `where` (equality, `eq`, `inq`
   * and arrays, joined by `and`). Any other shape cannot be checked, and the write is refused with
   * its own message - never skipped. `ScopeFilters.UNRESTRICTED` bypasses the guard too, which is the
   * deliberate way to write across scopes (system scope, an admin role).
   *
   * Not checked: an update that does not name the scope column (the row was already selected through
   * the scoped `where`), and raw statements that bypass the repository.
   */
  writeGuard?: TScopeWriteGuard;

  /**
   * `true` lets a restricted caller write `null` to a scope column, or leave it out on create: the
   * row has no owner and is shared. Default `false`, so `null` is refused like any other value
   * outside the scope, even when the resolved scope has a `null` branch (that branch lets the caller
   * READ shared rows, a separate permission). Reads are scoped as before.
   */
  sharedRows?: boolean;

  /**
   * The property names the write guard checks. Optional: with none declared the guard checks every
   * column the resolved scope constrains. When declared, each name must exist on the model (checked
   * at boot), and a resolved scope that constrains any other column is refused as unverifiable.
   */
  columns?: string[];
}

export interface IModelSettings {
  /** Properties excluded from all query results at SQL level. */
  hiddenProperties?: string[];

  /** Default filter auto-applied to all repository operations. Bypassable via shouldSkipDefaultFilter. */
  defaultFilter?: TFilter;

  /**
   * Row scope: ANDed into every read and write whose scope is expressible as a filter clause, and
   * NOT removable by `shouldSkipDefaultFilter`. Resolved per query, so it can depend on the current
   * request. Ownership resolved per row or through a polymorphic reference is NOT expressible here -
   * that check is still the application's to perform.
   *
   * Relational repositories only - a search-backed model (Typesense, Meilisearch) never reads
   * this setting, so mirroring a scoped entity into a search index needs its own query-time scope.
   */
  scopeFilter?: IScopeFilterSettings;

  /** Default row limit when a query omits `limit`. Must be a positive integer. Falls back to DEFAULT_LIMIT (10). */
  defaultLimit?: number;

  /**
   * Largest `limit` a CALLER may ask for. Must be a positive integer. Falls back to
   * DEFAULT_MAX_LIMIT (1000).
   *
   * Policy, not capacity - the engine's own ceiling sits far above it. The number is chosen so
   * that reaching it means the caller is doing something unusual, and raising it is how a model
   * says so deliberately.
   */
  maxLimit?: number;

  /** Authorization settings for this model (principal name, etc.). */
  authorize?: IModelAuthorizeSettings;
}

export interface IModelMetadata extends IArtifactRegistrationOptions {
  type: 'entity' | 'view';
  tableName?: string;
  skipMigrate?: boolean;
  settings?: IModelSettings;
}

export interface IEntityStatics {
  schema?: unknown;
  relations?: TValueOrResolver<Array<unknown>>;
}

export type TModelClass<Model extends AbstractEntity = AbstractEntity> = TClass<Model> &
  IEntityStatics;

/** Decorator target for model classes (supports both strongly typed and ClassDecorator patterns). */
export type TDecoratorModelTarget<Model extends AbstractEntity = AbstractEntity> =
  | TModelClass<Model>
  | (Function & IEntityStatics);

export interface IModelRegistryEntry<Model extends AbstractEntity = AbstractEntity> {
  target: TValueOrResolver<TClass<Model>>;
  metadata: IModelMetadata;
  schema: unknown;

  /** Lazy resolver to avoid circular deps. Resolved when DataSource builds schema. */
  relationsResolver?: TValueOrResolver<Array<unknown>>;

  /** Cache populated on first buildSchema() call. */
  _builtRelations?: unknown;
}
