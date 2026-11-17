import type { AbstractEntity, TModelType } from '@/base/models';
import type {
  ScopeFilters,
  ScopeThrough,
  TFilter,
  TScopeFilterMissingBehavior,
  TScopeOperation,
  TScopeWriteGuard,
  TWhere,
} from '@/base/repositories';
import type { TClass, TNullable, TValueOrResolver } from '@venizia/ignis-helpers/common';
import type { IArtifactRegistrationOptions } from './artifact';

/** The `authorize` settings of a model. */
export interface IModelAuthorizeSettings {
  /** The authorization principal name (resource/subject) for this model. */
  principal: string;
  /** Extensible - consumers can add any extra authorization metadata. */
  [extra: string | symbol]: unknown;
}

/** What a restricted caller may write to the scope columns (`@model` settings.access.write). */
export interface IModelAccessWriteSettings {
  /**
   * What a create, createAll or an update payload that names a scope column does when its value
   * disagrees with the resolved scope. `reject` refuses the write and writes nothing - for
   * `createAll` not even the valid rows. `assign` also fills a scope column that is ABSENT from a
   * created row, when the scope is a single equality; a value that is present and disagrees is
   * still refused.
   *
   * The scope's columns and allowed values are read from the resolved `where` (equality, `eq`, `inq`
   * and arrays, `and`, and an `or` over one column). Any other shape cannot be checked, and the write
   * is refused with its own message - never skipped. `ScopeFilters.UNRESTRICTED` bypasses the guard
   * too, which is the deliberate way to write across scopes (system scope, an admin role).
   *
   * Not checked: an update that does not name the scope column (the row was already selected through
   * the scoped `where`), and raw statements that bypass the repository.
   *
   * @default 'reject'
   */
  mode?: TScopeWriteGuard;

  /**
   * `true` lets a restricted caller write `null` to a scope column, or leave it out on create: the
   * row has no owner and is shared. Without it, `null` is refused like any other value
   * outside the scope, even when the resolved scope has a `null` branch (that branch lets the caller
   * READ shared rows, a separate permission). Reads are scoped as before.
   *
   * @default false
   */
  sharedRows?: boolean;
}

/**
 * Row access for `@model` settings.access - resolved per query, so it can depend on the current
 * request (tenant, org, membership). Framework-internal escape hatches aside, nothing short of
 * removing this setting from the model turns scoping off.
 *
 * @example
 * ```typescript
 * import { model, ScopeWriteGuards } from '@venizia/ignis';
 * import { ModelFactory } from '@venizia/ignis-connectors/postgres';
 * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
 *
 * const productTable = pgTable('Product', { id: serial('id').primaryKey(), merchantId: text('merchant_id') });
 *
 * export @model({ settings: { access: {
 *   resolve: () => ({ merchantId: 'm-1' }),
 *   write: { mode: ScopeWriteGuards.ASSIGN },
 * } } })
 * class Product extends ModelFactory.defineEntity({ table: productTable }) {}
 * ```
 */
export interface IModelAccessSettings {
  /** A model declares a resolver or a `through`, never both. */
  through?: never;

  /**
   * Returns the scope `where`; `ScopeFilters.UNRESTRICTED` to apply no scope for THIS call (an
   * internal operator, a caller the application has decided sees everything); or null/undefined
   * when this caller's scope cannot be determined at all.
   *
   * Receives `{ operation }`: the one concrete operation the call performs (`ScopeOperations.READ`,
   * `CREATE`, `UPDATE` or `DELETE`, never a group), so one function can answer a wide scope for a
   * read and a narrow one for a write. A read, and an included relation, pass `READ`; a create passes
   * `CREATE`; an update passes `UPDATE` for the payload check and for choosing the rows to update; a
   * delete, a soft delete included, passes `DELETE` for both; a restore passes `UPDATE`. A read with a
   * row `lock` passes `READ`. A resolver that takes no argument keeps working. An `or` over different
   * columns is still refused on a write, so return the narrow scope for a write operation.
   */
  resolve: (context: {
    operation: TScopeOperation;
  }) => TNullable<TWhere> | typeof ScopeFilters.UNRESTRICTED;

  /**
   * What `applyScopeFilter` does when `resolve()` returns null/undefined - no request context, no
   * tenant, a background job. With `deny`, an unresolved scope matches zero rows, never
   * every row. `allow` is an explicit, reviewed opt-out for migrations and background jobs, declared
   * per MODEL - it cannot express a per-USER bypass; use `ScopeFilters.UNRESTRICTED` for that.
   *
   * @default 'deny'
   */
  onMissing?: TScopeFilterMissingBehavior;

  /**
   * The property names the write guard checks. Optional: with none declared the guard checks every
   * column the resolved scope constrains. When declared, each name must exist on the model (checked
   * at boot), and a resolved scope that constrains any other column is refused as unverifiable.
   */
  columns?: string[];

  /** What a restricted caller may write to the scope columns. See {@link IModelAccessWriteSettings}. */
  write?: IModelAccessWriteSettings;
}

/**
 * Row access for a child model that has no scope columns of its own: it inherits the scope of the parent a `one`
 * relation points at. A parent that resolves no scope always denies the child: `onMissing` is not offered here, because
 * `'allow'` would show the child's rows of every tenant while the parent shows none.
 *
 * @example
 * ```typescript
 * import { model, ScopeThrough } from '@venizia/ignis';
 * import { ModelFactory, one } from '@venizia/ignis-connectors/postgres';
 * import { integer, pgTable, serial } from 'drizzle-orm/pg-core';
 * const productTable = pgTable('Product', { id: serial('id').primaryKey() });
 * const variantTable = pgTable('Variant', {
 *   id: serial('id').primaryKey(),
 *   productId: integer('product_id').references(() => productTable.id),
 * });
 * const VariantBase = ModelFactory.defineEntity({ table: variantTable, relations: () => ({ product: one(productTable) }) });
 * export @model({ settings: { access: { through: ScopeThrough.of({ entity: VariantBase, relation: 'product' }) } } })
 * class Variant extends VariantBase {}
 * ```
 *
 * @example
 * ```typescript
 * // A hand-written entity declares the same relation by hand.
 * import { ScopeThrough } from '@venizia/ignis';
 * import { BaseEntity, one, RelationDeclarations } from '@venizia/ignis-connectors/postgres';
 * import { integer, pgTable, serial } from 'drizzle-orm/pg-core';
 * const productTable = pgTable('Product', { id: serial('id').primaryKey() });
 * const variantTable = pgTable('Variant', { id: serial('id').primaryKey(), productId: integer('product_id').references(() => productTable.id) });
 * const relations = { product: one(productTable) };
 * class VariantBase extends BaseEntity<typeof variantTable> {
 *   static override schema = variantTable;
 *   static readonly relationDefinitions = relations;
 *   static override relations = () => RelationDeclarations.toRelationConfigs({ relations });
 * }
 * const through = ScopeThrough.of({ entity: VariantBase, relation: 'product' });
 * ```
 */
export interface IModelAccessThroughSettings {
  through: ScopeThrough;
  onMissing?: never;
  resolve?: never;
  columns?: never;
  write?: never;
}

/** The two shapes of `@model` settings.access: a resolver, or a `through`. */
export type TModelAccessSettings = IModelAccessSettings | IModelAccessThroughSettings;

/** What a query runs with when it names nothing (`@model` settings.query). */
export interface IModelQuerySettings {
  /** Default filter auto-applied to all repository operations. Bypassable via shouldSkipDefaultFilter. */
  filter?: TFilter;

  limit?: {
    /**
     * Row limit when a query omits `limit`. Must be a positive integer.
     *
     * @default DEFAULT_LIMIT
     */
    default?: number;

    /**
     * Largest `limit` a CALLER may ask for. Must be a positive integer.
     *
     * Policy, not capacity - the engine's own ceiling sits far above it. The number is chosen so
     * that reaching it means the caller is doing something unusual, and raising it is how a model
     * says so deliberately.
     *
     * @default DEFAULT_MAX_LIMIT
     */
    max?: number;
  };
}

/** Property groups of `@model` settings. */
export interface IModelProperties {
  /** Properties excluded from all query results at SQL level. */
  hidden?: string[];

  /**
   * Properties the server fills on every write, which a generated create or update body leaves out.
   *
   * @default AuditFields.SCHEME_SET
   */
  stamped?: ReadonlyArray<string> | ReadonlySet<string>;
}

/** Per-model settings passed to `@model` as `settings`. */
export interface IModelSettings {
  properties?: IModelProperties;

  /** Default filter and limits of a query: `filter`, `limit.default`, `limit.max`. */
  query?: IModelQuerySettings;

  /**
   * Row access: the scope ANDed into every read and write whose scope is expressible as a filter
   * clause, NOT removable by `shouldSkipDefaultFilter`, and the guard that holds writes to it.
   * Ownership resolved per row or through a polymorphic reference is NOT expressible here - that
   * check is still the application's to perform.
   *
   * Relational repositories only - a search-backed model (Typesense, Meilisearch) never reads
   * this setting, so mirroring a scoped entity into a search index needs its own query-time scope.
   */
  access?: TModelAccessSettings;

  /** Authorization settings for this model (principal name, etc.). */
  authorize?: IModelAuthorizeSettings;
}

/** Whether tooling that reads the model registry should migrate this model (`@model({ migration })`). */
export interface IModelMigrationSettings {
  /**
   * `false` marks the model as one a migration tool leaves alone. IGNIS generates no migrations itself.
   *
   * @default true
   */
  use?: boolean;
}

/** Metadata accepted by `@model`. */
export interface IModelMetadata extends IArtifactRegistrationOptions {
  /**
   * `ModelTypes.ENTITY` is the only value.
   *
   * @default ModelTypes.ENTITY
   */
  type?: TModelType;
  tableName?: string;

  /** Migration marker for consumer tooling that reads the public registry. */
  migration?: IModelMigrationSettings;

  settings?: IModelSettings;
}

/** Static members an entity class carries: its `schema` and its `relations` (value or resolver). */
export interface IEntityStatics {
  schema?: unknown;
  relations?: TValueOrResolver<Array<unknown>>;
}

/** A model class together with its entity statics. */
export type TModelClass<Model extends AbstractEntity = AbstractEntity> = TClass<Model> &
  IEntityStatics;

/** Decorator target for model classes (supports both strongly typed and ClassDecorator patterns). */
export type TDecoratorModelTarget<Model extends AbstractEntity = AbstractEntity> =
  | TModelClass<Model>
  | (Function & IEntityStatics);

/** One model as stored in the metadata registry: class, metadata and schema, with lazily resolved relations. */
export interface IModelRegistryEntry<Model extends AbstractEntity = AbstractEntity> {
  target: TValueOrResolver<TClass<Model>>;
  metadata: IModelMetadata;
  schema: unknown;

  /** Lazy resolver to avoid circular deps. Resolved when DataSource builds schema. */
  relationsResolver?: TValueOrResolver<Array<unknown>>;

  /** Cache populated on first buildSchema() call. */
  _builtRelations?: unknown;
}
