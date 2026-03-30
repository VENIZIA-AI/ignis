import { IDataSource, ITransaction } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { z } from '@hono/zod-openapi';
import { TLogLevel, TNullable } from '@venizia/ignis-helpers';
import { Column, SQL, createTableRelationsHelpers } from 'drizzle-orm';
import { DEFAULT_LIMIT, RelationTypes, TLockStrength } from './constants';

/** Zod schema for pagination skip parameter. */
export const SkipSchema = z
  .number()
  .optional()
  .openapi({
    description: 'Number of items to skip for pagination.',
    examples: [1, 2, 3],
  });

export type TSkip = z.infer<typeof SkipSchema>;

/** Zod schema for pagination offset parameter. */
export const OffsetSchema = z
  .number()
  .optional()
  .openapi({
    description: 'Number of items to offset for pagination.',
    examples: [1, 2, 3],
  });

export type TOffset = z.infer<typeof OffsetSchema>;

/** Zod schema for pagination limit parameter. Defaults to DEFAULT_LIMIT (10). */
export const LimitSchema = z
  .number()
  .optional()
  .default(DEFAULT_LIMIT)
  .openapi({
    description: 'Maximum number of items to return. Default is 10.',
    examples: [1, 2, 3],
  });

export type TLimit = z.infer<typeof LimitSchema>;

/** Zod schema for query ordering. Supports regular columns and JSON/JSONB paths. */
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

export type TOrderBy = z.infer<typeof OrderBySchema>;

/** @internal Recursive schema for where clause validation with nested AND/OR. */
const _WhereSchema: z.ZodType<any> = z.lazy(() =>
  z.record(z.string(), z.any()).and(
    z.object({
      and: z.array(_WhereSchema).optional(),
      or: z.array(_WhereSchema).optional(),
    }),
  ),
);

/** Zod schema for query where conditions. Supports object format and JSON string format. */
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

/** Where clause conditions with field-level conditions and logical AND/OR grouping. */
export type TWhere<T = any> = { [key in keyof T]?: any } & { and?: TWhere<T>[]; or?: TWhere<T>[] };

/** Zod schema for field/column selection. Supports array format or object format. */
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

/** Field selection -- object mapping field names to booleans, or array of field names. */
export type TFields<T = any> = Partial<{ [K in keyof T]: boolean }> | Array<keyof T>;

/** Zod schema for including related entities in queries with optional nested filtering. */
export const InclusionSchema = z
  .array(
    z.object({
      relation: z.string().openapi({ description: 'Model relation name' }),
      scope: z
        .lazy(() => FilterSchema) // eslint-disable-line @typescript-eslint/no-use-before-define
        .optional()
        .openapi({ description: 'Model relation filter' }),
      shouldSkipDefaultFilter: z
        .boolean()
        .optional()
        .openapi({ description: 'Skip the default filter for this relation' }),
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

/** Single relation inclusion configuration. */
export type TInclusion = { relation: string; scope?: TFilter; shouldSkipDefaultFilter?: boolean };

/** @internal Filter schema object definition. */
const _FilterSchema = z.object({
  where: WhereSchema.optional(),
  fields: FieldsSchema,
  include: InclusionSchema,
  order: OrderBySchema,
  limit: LimitSchema,
  offset: OffsetSchema,
  skip: SkipSchema,
});

/** Comprehensive Zod schema for repository query filtering. Supports object and JSON string formats. */
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

/** Comprehensive filter configuration used across all repository query methods. */
export type TFilter<T = any> = {
  where?: TWhere<T>;
  fields?: TFields;
  include?: TInclusion[];
  order?: string[];
  limit?: number;
  offset?: number;
  skip?: number;
};

/** Update data supporting both regular fields and JSON path updates via dot notation. */
export type TUpdateData<T = any> = Partial<T> & {
  [jsonPath: string]: any;
};

/** Zod schema for count operation results. */
export const CountSchema = z.object({ count: z.number().default(0) }).openapi({
  description: 'Total count of items matching the criteria.',
  examples: [{ count: 0 }, { count: 10 }],
});

export type TCount = z.infer<typeof CountSchema>;

/** Data range information for paginated queries. Follows HTTP Content-Range standard. */
export type TDataRange = {
  start: number;
  end: number;
  total: number;
};

/** Options for Drizzle ORM query building, used internally by FilterBuilder. */
export type TDrizzleQueryOptions = Partial<{
  limit: number;
  offset: number;
  orderBy: SQL[];
  where: SQL;
  with: Record<string, true | TDrizzleQueryOptions>;
  columns: Record<string, boolean>;
}>;

/** Configuration for entity relationships (one-to-one, one-to-many, many-to-one). */
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

/** Configuration for repository operation logging. */
export type TRepositoryLogOptions = {
  use: boolean;
  level?: TLogLevel;
};

/** Configuration for row-level lock wait behavior. Mutually exclusive: use noWait OR skipLocked. */
export type TLockConfig =
  | { noWait: true; skipLocked?: undefined }
  | { noWait?: undefined; skipLocked: true }
  | { noWait?: undefined; skipLocked?: undefined };

/** Row-level locking options for read operations. */
export type TLockOptions = {
  strength: TLockStrength;
  config?: TLockConfig;
};

/** Interface for objects that can be associated with a database transaction. */
export interface IWithTransaction {
  transaction?: ITransaction;
}

/** Extended options for repository operations with transaction, logging, and default filter bypass. */
export interface IExtraOptions extends IWithTransaction {
  log?: TRepositoryLogOptions;

  /** If true, bypass the default filter configured in model settings (e.g., soft delete). */
  shouldSkipDefaultFilter?: boolean;

  /** Row-level locking. Requires transaction. Incompatible with include/fields (Query API). */
  lock?: TLockOptions;
}

/** @deprecated Use IExtraOptions instead. */
export type TTransactionOption = IExtraOptions;

/** Base repository interface defining core properties and methods. */
export interface IRepository<EntitySchema extends TTableSchemaWithId = TTableSchemaWithId> {
  dataSource: IDataSource;
  entity: BaseEntity<EntitySchema>;
  getEntity(): BaseEntity<EntitySchema>;
  getEntitySchema(): EntitySchema;
  getConnector(): IDataSource['connector'];
}

/** Interface for read-only repository operations. */
export interface IReadableRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IRepository<EntitySchema> {
  buildQuery(opts: { filter: TFilter<DataObject> }): TDrizzleQueryOptions;
  count(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<TCount>;
  existsWith(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<boolean>;

  find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options: ExtraOptions & { shouldQueryRange: true };
  }): Promise<{ data: Array<R>; range: TDataRange }>;

  find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions & { shouldQueryRange?: false };
  }): Promise<Array<R>>;

  findOne<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>>;

  findById<R = DataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<DataObject>, 'where'>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>>;
}

/** Interface for full CRUD repository operations. */
export interface IPersistableRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IReadableRepository<EntitySchema, DataObject, ExtraOptions> {
  create(opts: {
    data: PersistObject;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  create<R = DataObject>(opts: {
    data: PersistObject;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  createAll(opts: {
    data: Array<PersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  createAll<R = DataObject>(opts: {
    data: Array<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: Array<R> }>;

  updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  updateById<R = DataObject>(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  updateAll<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  /** Alias for updateAll. */
  updateBy(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  /** Alias for updateAll. */
  updateBy<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  deleteById(opts: {
    id: IdType;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  deleteById<R = DataObject>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  deleteAll(opts: {
    where?: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  deleteAll<R = DataObject>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  /** Alias for deleteAll. */
  deleteBy(opts: {
    where?: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  /** Alias for deleteAll. */
  deleteBy<R = DataObject>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
}

/** Options passed to query operator handler functions. */
export interface IQueryHandlerOptions<T = any> {
  column: Column;
  value: T;
}
