import { IDataSource, ITransaction } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { z } from '@hono/zod-openapi';
import { TLogLevel, TNullable } from '@venizia/ignis-helpers';
import { Column, SQL, createTableRelationsHelpers } from 'drizzle-orm';
import { DEFAULT_LIMIT, RelationTypes } from './constants';

// -----------------------------------------------------------------------------
// Pagination Schemas
// -----------------------------------------------------------------------------

/**
 * Zod schema for pagination skip parameter.
 * Specifies how many items to skip from the beginning of the result set.
 *
 * @example
 * ```typescript
 * // Skip first 10 items
 * const filter = { skip: 10, limit: 5 };
 * ```
 */
export const SkipSchema = z
  .number()
  .optional()
  .default(0)
  .openapi({
    description: 'Number of items to skip for pagination. Default is 0.',
    examples: [1, 2, 3],
  });

/** Type for pagination skip parameter. Inferred from {@link SkipSchema}. */
export type TSkip = z.infer<typeof SkipSchema>;

/**
 * Zod schema for pagination offset parameter.
 * Alternative to skip - specifies the starting position in the result set.
 *
 * @example
 * ```typescript
 * // Start from the 20th item
 * const filter = { offset: 20, limit: 10 };
 * ```
 */
export const OffsetSchema = z
  .number()
  .optional()
  .default(0)
  .openapi({
    description: 'Number of items to offset for pagination. Default is 0.',
    examples: [1, 2, 3],
  });

/** Type for pagination offset parameter. Inferred from {@link OffsetSchema}. */
export type TOffset = z.infer<typeof OffsetSchema>;

/**
 * Zod schema for pagination limit parameter.
 * Specifies the maximum number of items to return in a query.
 * Defaults to {@link DEFAULT_LIMIT} (10).
 *
 * @example
 * ```typescript
 * // Return at most 25 items
 * const filter = { limit: 25 };
 * ```
 */
export const LimitSchema = z
  .number()
  .optional()
  .default(DEFAULT_LIMIT)
  .openapi({
    description: 'Maximum number of items to return. Default is 10.',
    examples: [1, 2, 3],
  });

/** Type for pagination limit parameter. Inferred from {@link LimitSchema}. */
export type TLimit = z.infer<typeof LimitSchema>;

// -----------------------------------------------------------------------------
// Sorting Schema
// -----------------------------------------------------------------------------

/**
 * Zod schema for query ordering/sorting.
 * Supports sorting by regular columns and JSON/JSONB paths.
 *
 * @example
 * ```typescript
 * // Sort by single column
 * const filter = { order: ['createdAt DESC'] };
 *
 * // Sort by multiple columns
 * const filter = { order: ['priority DESC', 'createdAt ASC'] };
 *
 * // Sort by JSON path
 * const filter = { order: ['metadata.score DESC'] };
 * ```
 */
export const OrderBySchema = z
  .array(z.string())
  .optional()
  .openapi({
    description:
      "Sorting order for results. Supports regular columns ('fieldName ASC') and JSON/JSONB paths ('metadata.field DESC', 'data.nested[0].value ASC').",
    examples: [
      'id DESC',
      'createdAt ASC',
      'metadata.priority DESC',
      'data.nested.value ASC',
      'items[0].score DESC',
    ],
  });

/** Type for ordering/sorting parameter. Inferred from {@link OrderBySchema}. */
export type TOrderBy = z.infer<typeof OrderBySchema>;

// -----------------------------------------------------------------------------
// Where/Filter Condition Schemas
// -----------------------------------------------------------------------------

/**
 * Internal recursive schema for where clause validation.
 * Supports nested AND/OR logical operations.
 * @internal
 */
const _WhereSchema: z.ZodType<any> = z.lazy(() =>
  z.record(z.string(), z.any()).and(
    z.object({
      and: z.array(_WhereSchema).optional(),
      or: z.array(_WhereSchema).optional(),
    }),
  ),
);

/**
 * Zod schema for query where conditions.
 * Supports both object format and JSON string format (for URL query params).
 *
 * Features:
 * - Field equality: `{ name: 'John' }`
 * - Comparison operators: `{ age: { gte: 18 } }`
 * - Logical AND: `{ and: [{ status: 'active' }, { role: 'admin' }] }`
 * - Logical OR: `{ or: [{ status: 'active' }, { isPublished: true }] }`
 * - JSON path queries: `{ 'metadata.score': { gt: 50 } }`
 *
 * @example
 * ```typescript
 * // Simple equality
 * const where = { status: 'active' };
 *
 * // With operators
 * const where = { age: { gte: 18, lt: 65 } };
 *
 * // Logical operations
 * const where = { or: [{ role: 'admin' }, { role: 'moderator' }] };
 * ```
 */
export const WhereSchema = z
  .union([
    _WhereSchema,
    z
      .string()
      .transform(val => {
        if (val) {
          return JSON.parse(val);
        }

        return undefined;
      })
      .pipe(_WhereSchema),
  ])
  .openapi({
    type: 'object',
    description: 'Query conditions for selecting data.',
  });

/**
 * Type for where clause conditions.
 * Supports field-level conditions and logical AND/OR grouping.
 *
 * @template T - The entity type for type-safe field names
 *
 * @example
 * ```typescript
 * // Type-safe where with entity
 * const where: TWhere<User> = {
 *   email: 'john@example.com',
 *   and: [{ isActive: true }, { role: 'admin' }]
 * };
 * ```
 */
export type TWhere<T = any> = { [key in keyof T]?: any } & { and?: TWhere<T>[]; or?: TWhere<T>[] };

// -----------------------------------------------------------------------------
// Field Selection Schema
// -----------------------------------------------------------------------------

/**
 * Zod schema for field/column selection.
 * Supports two formats:
 * - Array format: `['id', 'name', 'email']` - include only these fields
 * - Object format: `{ id: true, name: true, password: false }` - include/exclude fields
 *
 * @example
 * ```typescript
 * // Array format - include only specified fields
 * const filter = { fields: ['id', 'name', 'email'] };
 *
 * // Object format - include specific, exclude others
 * const filter = { fields: { id: true, name: true, password: false } };
 * ```
 */
export const FieldsSchema = z
  .record(z.string(), z.boolean())
  .or(z.array(z.string()))
  .optional()
  .openapi({
    description:
      'Fields selection - either an array of field names to include, or an object with field names as keys and boolean values (true to include, false to exclude)',
    examples: [
      JSON.stringify(['id', 'name', 'email']),
      JSON.stringify({ id: true, name: true }),
      JSON.stringify({ id: true, name: true, email: true, fullName: false }),
    ],
  });

/**
 * Type for field selection.
 * Can be an object mapping field names to booleans, or an array of field names.
 *
 * @template T - The entity type for type-safe field names
 */
export type TFields<T = any> = Partial<{ [K in keyof T]: boolean }> | Array<keyof T>;

// -----------------------------------------------------------------------------
// Relation Inclusion Schema
// -----------------------------------------------------------------------------

/**
 * Zod schema for including related entities in queries.
 * Allows eager loading of related data with optional nested filtering.
 *
 * @example
 * ```typescript
 * // Simple inclusion
 * const filter = { include: [{ relation: 'posts' }] };
 *
 * // With nested scope/filter
 * const filter = {
 *   include: [{
 *     relation: 'posts',
 *     scope: { where: { isPublished: true }, limit: 5 }
 *   }]
 * };
 * ```
 */
export const InclusionSchema = z
  .array(
    z.object({
      relation: z.string().openapi({ description: 'Model relation name' }),
      scope: z
        .lazy(() => FilterSchema) // eslint-disable-line @typescript-eslint/no-use-before-define
        .optional()
        .openapi({ description: 'Model relation filter' }),
    }),
  )
  .optional()
  .openapi({
    description: 'Define related models to include in the response.',
    examples: [
      JSON.stringify({ include: [{ relation: 'posts' }] }),
      JSON.stringify({ include: [{ relation: 'posts', scope: { limit: 5 } }] }),
    ],
  });

/**
 * Type for a single relation inclusion configuration.
 *
 * @property relation - The name of the relation to include
 * @property scope - Optional filter to apply to the related entities
 */
export type TInclusion = { relation: string; scope?: TFilter };

// -----------------------------------------------------------------------------
// Main Filter Schema
// -----------------------------------------------------------------------------

/**
 * Internal filter schema object definition.
 * @internal
 */
const _FilterSchema = z.object({
  where: WhereSchema.optional(),
  fields: FieldsSchema,
  include: InclusionSchema,
  order: OrderBySchema,
  limit: LimitSchema,
  offset: OffsetSchema,
  skip: SkipSchema,
});

/**
 * Comprehensive Zod schema for repository query filtering.
 * Combines where conditions, field selection, relation inclusion, pagination, and sorting.
 * Supports both object format and JSON string format (for URL query params).
 *
 * @example
 * ```typescript
 * // Complete filter example
 * const filter = {
 *   where: { status: 'active', role: { in: ['admin', 'moderator'] } },
 *   fields: ['id', 'name', 'email'],
 *   include: [{ relation: 'posts', scope: { limit: 5 } }],
 *   order: ['createdAt DESC'],
 *   limit: 20,
 *   skip: 0
 * };
 * ```
 */
export const FilterSchema = z
  .union([
    _FilterSchema,
    z
      .string()
      .transform(val => {
        if (val) {
          return JSON.parse(val);
        }

        return {};
      })
      .pipe(_FilterSchema),
  ])
  .optional()
  .openapi({
    type: 'object',
    description:
      'A comprehensive filter object for querying data, including conditions, field selection, relations, pagination, and sorting.',
    examples: [
      JSON.stringify({ where: { name: 'John Doe' }, limit: 10 }),
      JSON.stringify({ fields: { id: true, name: true, email: true }, order: ['createdAt DESC'] }),
      JSON.stringify({ include: [{ relation: 'posts', scope: { limit: 5 } }] }),
      JSON.stringify({
        where: { or: [{ status: 'active' }, { isPublished: true }] },
        skip: 20,
        limit: 10,
      }),
      JSON.stringify({ where: { and: [{ role: 'admin' }, { createdAt: { gte: 'YYYY-MM-DD' } }] } }),
    ],
  });

/**
 * Type for comprehensive filter configuration.
 * Used across all repository query methods.
 *
 * @template T - The entity type for type-safe where conditions
 *
 * @property where - Query conditions for filtering results
 * @property fields - Field selection (include/exclude columns)
 * @property include - Related entities to eager load
 * @property order - Sorting order for results
 * @property limit - Maximum number of results to return
 * @property offset - Number of results to skip (alternative to skip)
 * @property skip - Number of results to skip
 */
export type TFilter<T = any> = {
  where?: TWhere<T>;
  fields?: TFields;
  include?: TInclusion[];
  order?: string[];
  limit?: number;
  offset?: number;
  skip?: number;
};

// -----------------------------------------------------------------------------
// Count Schema
// -----------------------------------------------------------------------------

/**
 * Zod schema for count operation results.
 * Returns the total number of matching records.
 */
export const CountSchema = z.object({ count: z.number().default(0) }).openapi({
  description: 'Total count of items matching the criteria.',
  examples: [{ count: 0 }, { count: 10 }],
});

/** Type for count operation results. Inferred from {@link CountSchema}. */
export type TCount = z.infer<typeof CountSchema>;

// -----------------------------------------------------------------------------
// Drizzle ORM Types
// -----------------------------------------------------------------------------

/**
 * Options for Drizzle ORM query building.
 * Internal type used by the FilterBuilder to construct Drizzle queries.
 *
 * @property limit - Maximum records to return
 * @property offset - Records to skip
 * @property orderBy - SQL order expressions
 * @property where - SQL where condition
 * @property with - Relation inclusion configuration
 * @property columns - Column selection configuration
 */
export type TDrizzleQueryOptions = Partial<{
  limit: number;
  offset: number;
  orderBy: SQL[];
  where: SQL;
  with: Record<string, true | TDrizzleQueryOptions>;
  columns: Record<string, boolean>;
}>;

// -----------------------------------------------------------------------------
// Relation Configuration
// -----------------------------------------------------------------------------

/**
 * Configuration for entity relationships.
 * Used to define one-to-one, one-to-many, and many-to-one relations.
 *
 * @property name - The relation name used in include queries
 * @property type - The relation type ('one' or 'many')
 * @property schema - The related entity's table schema
 * @property metadata - Drizzle relation metadata (fields, references)
 *
 * @example
 * ```typescript
 * const postsRelation: TRelationConfig = {
 *   name: 'posts',
 *   type: RelationTypes.MANY,
 *   schema: PostSchema,
 *   metadata: { fields: [Post.schema.authorId], references: [User.schema.id] }
 * };
 * ```
 */
export type TRelationConfig = {
  name: string;
} & (
  | {
      type: typeof RelationTypes.ONE;
      schema: TTableSchemaWithId;
      metadata: Parameters<
        ReturnType<typeof createTableRelationsHelpers>[typeof RelationTypes.ONE]
      >[1];
    }
  | {
      type: typeof RelationTypes.MANY;
      schema: TTableSchemaWithId;
      metadata: Parameters<
        ReturnType<typeof createTableRelationsHelpers>[typeof RelationTypes.MANY]
      >[1];
    }
);

// -----------------------------------------------------------------------------
// Logging Configuration
// -----------------------------------------------------------------------------

/**
 * Configuration for repository operation logging.
 *
 * @property use - Whether to enable logging for this operation
 * @property level - The log level to use (defaults to 'info')
 */
export type TRepositoryLogOptions = {
  use: boolean;
  level?: TLogLevel;
};

// -----------------------------------------------------------------------------
// Transaction Support
// -----------------------------------------------------------------------------

/**
 * Interface for objects that can be associated with a database transaction.
 */
export interface IWithTransaction {
  /** The active transaction to use for this operation. */
  transaction?: ITransaction;
}

/**
 * Extended options for repository operations.
 * Includes transaction support, logging configuration, and default filter bypass.
 *
 * @example
 * ```typescript
 * // Use with transaction
 * const tx = await repository.beginTransaction();
 * await repository.create({ data: user, options: { transaction: tx } });
 * await tx.commit();
 *
 * // Enable logging for debugging
 * await repository.find({ filter: {}, options: { log: { use: true, level: 'debug' } } });
 *
 * // Bypass default filter (e.g., soft delete)
 * await repository.find({ filter: {}, options: { shouldSkipDefaultFilter: true } });
 * ```
 */
export interface IExtraOptions extends IWithTransaction {
  /** Optional logging configuration for this operation. */
  log?: TRepositoryLogOptions;

  /**
   * If true, bypass the default filter configured in model settings.
   * Use this when you need to query all records regardless of default filter constraints.
   *
   * @example
   * ```typescript
   * // Bypass default filter: { where: { isDeleted: false } }
   * repository.find({ filter: {}, options: { shouldSkipDefaultFilter: true } });
   * ```
   */
  shouldSkipDefaultFilter?: boolean;
}

/**
 * @deprecated Use {@link IExtraOptions} instead.
 */
export type TTransactionOption = IExtraOptions;

// -----------------------------------------------------------------------------
// Repository Interfaces
// -----------------------------------------------------------------------------

/**
 * Base repository interface.
 * Defines the core properties and methods that all repositories must implement.
 *
 * @template EntitySchema - The Drizzle table schema type with an 'id' column
 */
export interface IRepository<EntitySchema extends TTableSchemaWithId = TTableSchemaWithId> {
  /** The data source providing database connectivity. */
  dataSource: IDataSource;

  /** The entity/model instance associated with this repository. */
  entity: BaseEntity<EntitySchema>;

  /** Returns the entity instance. */
  getEntity(): BaseEntity<EntitySchema>;

  /** Returns the Drizzle table schema. */
  getEntitySchema(): EntitySchema;

  /** Returns the database connector from the data source. */
  getConnector(): IDataSource['connector'];
}

/**
 * Interface for read-only repository operations.
 * Provides methods for querying data without modification capabilities.
 *
 * @template EntitySchema - The Drizzle table schema type
 * @template DataObject - The type of objects returned from queries
 * @template ExtraOptions - Additional options type extending IExtraOptions
 */
export interface IReadableRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IRepository<EntitySchema> {
  /**
   * Builds Drizzle query options from a filter object.
   * @param opts - Options containing the filter to convert
   * @returns Drizzle-compatible query options
   */
  buildQuery(opts: { filter: TFilter<DataObject> }): TDrizzleQueryOptions;

  /**
   * Counts records matching the where condition.
   * @param opts - Options containing where condition
   * @returns Promise resolving to count result
   */
  count(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<TCount>;

  /**
   * Checks if any records match the where condition.
   * @param opts - Options containing where condition
   * @returns Promise resolving to true if records exist
   */
  existsWith(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<boolean>;

  /**
   * Finds all records matching the filter.
   * @template R - Return type (defaults to DataObject)
   * @param opts - Options containing filter and extra options
   * @returns Promise resolving to array of matching records
   */
  find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<Array<R>>;

  /**
   * Finds the first record matching the filter.
   * @template R - Return type (defaults to DataObject)
   * @param opts - Options containing filter and extra options
   * @returns Promise resolving to the found record or null
   */
  findOne<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>>;

  /**
   * Finds a record by its ID.
   * @template R - Return type (defaults to DataObject)
   * @param opts - Options containing id and optional filter (without where)
   * @returns Promise resolving to the found record or null
   */
  findById<R = DataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<DataObject>, 'where'>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>>;
}

/**
 * Interface for full CRUD repository operations.
 * Extends IReadableRepository with create, update, and delete capabilities.
 *
 * @template EntitySchema - The Drizzle table schema type
 * @template DataObject - The type of objects returned from queries
 * @template PersistObject - The type for insert/update operations
 * @template ExtraOptions - Additional options type extending IExtraOptions
 */
export interface IPersistableRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IReadableRepository<EntitySchema, DataObject, ExtraOptions> {
  /**
   * Creates a single record.
   * @param opts - Options with data and shouldReturn: false
   * @returns Promise with count only (no data returned)
   */
  create(opts: {
    data: PersistObject;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  /**
   * Creates a single record and returns it.
   * @template R - Return type (defaults to DataObject)
   * @param opts - Options with data to create
   * @returns Promise with count and created record
   */
  create<R = DataObject>(opts: {
    data: PersistObject;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  /**
   * Creates multiple records in bulk.
   * @param opts - Options with data array and shouldReturn: false
   * @returns Promise with count only
   */
  createAll(opts: {
    data: Array<PersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  /**
   * Creates multiple records and returns them.
   * @template R - Return type (defaults to DataObject)
   * @param opts - Options with data array
   * @returns Promise with count and created records
   */
  createAll<R = DataObject>(opts: {
    data: Array<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: Array<R> }>;

  /**
   * Updates a record by its ID.
   * @param opts - Options with id, partial data, and shouldReturn: false
   * @returns Promise with count only
   */
  updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  /**
   * Updates a record by its ID and returns it.
   * @template R - Return type (defaults to DataObject)
   * @param opts - Options with id and partial data
   * @returns Promise with count and updated record
   */
  updateById<R = DataObject>(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  /**
   * Updates all records matching the where condition.
   * @param opts - Options with data, where, and shouldReturn: false
   * @returns Promise with count only
   */
  updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  /**
   * Updates all records matching the where condition and returns them.
   * @template R - Return type (defaults to DataObject)
   * @param opts - Options with data and where condition
   * @returns Promise with count and updated records
   */
  updateAll<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  /**
   * Alias for updateAll. Updates records matching the where condition.
   * @param opts - Options with data, where, and shouldReturn: false
   * @returns Promise with count only
   */
  updateBy(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  /**
   * Alias for updateAll. Updates records and returns them.
   * @template R - Return type (defaults to DataObject)
   * @param opts - Options with data and where condition
   * @returns Promise with count and updated records
   */
  updateBy<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  /**
   * Deletes a record by its ID.
   * @param opts - Options with id and shouldReturn: false
   * @returns Promise with count only
   */
  deleteById(opts: {
    id: IdType;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  /**
   * Deletes a record by its ID and returns it.
   * @template R - Return type (defaults to DataObject)
   * @param opts - Options with id
   * @returns Promise with count and deleted record
   */
  deleteById<R = DataObject>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  /**
   * Deletes all records matching the where condition.
   * @param opts - Options with where and shouldReturn: false
   * @returns Promise with count only
   */
  deleteAll(opts: {
    where?: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  /**
   * Deletes all records matching the where condition and returns them.
   * @template R - Return type (defaults to DataObject)
   * @param opts - Options with where condition
   * @returns Promise with count and deleted records
   */
  deleteAll<R = DataObject>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  /**
   * Alias for deleteAll. Deletes records matching the where condition.
   * @param opts - Options with where and shouldReturn: false
   * @returns Promise with count only
   */
  deleteBy(opts: {
    where?: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  /**
   * Alias for deleteAll. Deletes records and returns them.
   * @template R - Return type (defaults to DataObject)
   * @param opts - Options with where condition
   * @returns Promise with count and deleted records
   */
  deleteBy<R = DataObject>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
}

// -----------------------------------------------------------------------------
// Query Operator Types
// -----------------------------------------------------------------------------

/**
 * Options passed to query operator handler functions.
 * Used internally by {@link QueryOperators} to build SQL conditions.
 *
 * @template T - The type of the comparison value
 *
 * @property column - The Drizzle column to compare against
 * @property value - The value to compare with
 */
export interface IQueryHandlerOptions<T = any> {
  column: Column;
  value: T;
}
