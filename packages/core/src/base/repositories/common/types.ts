import { IDataSource, ITransaction } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { z } from '@hono/zod-openapi';
import { TLogLevel, TNullable } from '@venizia/ignis-helpers';
import { Column, SQL, createTableRelationsHelpers } from 'drizzle-orm';
import { DEFAULT_LIMIT, RelationTypes } from './constants';

// ---------------------------------------------------------------------------
// Repository Interfaces
// ---------------------------------------------------------------------------
export const SkipSchema = z
  .number()
  .optional()
  .default(0)
  .openapi({
    description: 'Number of items to skip for pagination. Default is 0.',
    examples: [1, 2, 3],
  });
export type TSkip = z.infer<typeof SkipSchema>;

// ---------------------------------------------------------------------------
export const OffsetSchema = z
  .number()
  .optional()
  .default(0)
  .openapi({
    description: 'Number of items to offset for pagination. Default is 0.',
    examples: [1, 2, 3],
  });
export type TOffset = z.infer<typeof OffsetSchema>;

// ---------------------------------------------------------------------------
export const LimitSchema = z
  .number()
  .optional()
  .default(DEFAULT_LIMIT)
  .openapi({
    description: 'Maximum number of items to return. Default is 10.',
    examples: [1, 2, 3],
  });
export type TLimit = z.infer<typeof LimitSchema>;

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
const _WhereSchema: z.ZodType<any> = z.lazy(() =>
  z.record(z.string(), z.any()).and(
    z.object({
      and: z.array(_WhereSchema).optional(),
      or: z.array(_WhereSchema).optional(),
    }),
  ),
);

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

export type TWhere<T = any> = { [key in keyof T]?: any } & { and?: TWhere<T>[]; or?: TWhere<T>[] };

// ---------------------------------------------------------------------------
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

export type TFields<T = any> = Partial<{ [K in keyof T]: boolean }> | Array<keyof T>;

// ---------------------------------------------------------------------------
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
export type TInclusion = { relation: string; scope?: TFilter };

// ---------------------------------------------------------------------------
const _FilterSchema = z.object({
  where: WhereSchema.optional(),
  fields: FieldsSchema,
  include: InclusionSchema,
  order: OrderBySchema,
  limit: LimitSchema,
  offset: OffsetSchema,
  skip: SkipSchema,
});

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

export type TFilter<T = any> = {
  where?: TWhere<T>;
  fields?: TFields;
  include?: TInclusion[];
  order?: string[];
  limit?: number;
  offset?: number;
  skip?: number;
};

// ---------------------------------------------------------------------------
export const CountSchema = z.object({ count: z.number().default(0) }).openapi({
  description: 'Total count of items matching the criteria.',
  examples: [{ count: 0 }, { count: 10 }],
});
export type TCount = z.infer<typeof CountSchema>;

// ---------------------------------------------------------------------------
export type TDrizzleQueryOptions = Partial<{
  limit: number;
  offset: number;
  orderBy: SQL[];
  where: SQL;
  with: Record<string, true | TDrizzleQueryOptions>;
  columns: Record<string, boolean>;
}>;

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

export type TRepositoryLogOptions = {
  use: boolean;
  level?: TLogLevel;
};

// ---------------------------------------------------------------------------
// Transaction Support
// ---------------------------------------------------------------------------
export interface IWithTransaction {
  transaction?: ITransaction;
}

export interface IExtraOptions extends IWithTransaction {
  /**
   * If true, bypass the default filter configured in model settings.
   * Use this when you need to query all records regardless of default filter constraints.
   *
   * @example
   * // Bypass default filter: { where: { isDeleted: false } }
   * repository.find({ filter: {}, options: { shouldSkipDefaultFilter: true } });
   */
  shouldSkipDefaultFilter?: boolean;
}

/** @deprecated Use IExtraOptions instead */
export type TTransactionOption = IExtraOptions;

// ---------------------------------------------------------------------------
export interface IRepository<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
  dataSource: IDataSource;
  entity: BaseEntity<Schema>;

  getEntity(): BaseEntity<Schema>;
  getEntitySchema(): Schema;
  getConnector(): IDataSource['connector'];
}

export interface IReadableRepository<
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<Schema> = TTableObject<Schema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IRepository<Schema> {
  buildQuery(opts: { filter: TFilter<DataObject> }): TDrizzleQueryOptions;

  count(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<TCount>;
  existsWith(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<boolean>;

  find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<Array<R>>;
  findOne<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>>;
  findById<R = DataObject>(opts: {
    id: IdType;
    filter?: Exclude<TFilter<DataObject>, 'where'>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>>;
}

export interface IPersistableRepository<
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<Schema> = TTableObject<Schema>,
  PersistObject extends TTableInsert<Schema> = TTableInsert<Schema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IReadableRepository<Schema, DataObject, ExtraOptions> {
  create(opts: {
    data: PersistObject;
    options: ExtraOptions & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;
  create<R = Schema['$inferSelect']>(opts: {
    data: PersistObject;
    options?: ExtraOptions & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: R }>;

  createAll(opts: {
    data: Array<PersistObject>;
    options: ExtraOptions & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;
  createAll<R = Schema['$inferSelect']>(opts: {
    data: Array<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: Array<R> }>;

  updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options: ExtraOptions & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;
  updateById<R = Schema['$inferSelect']>(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: R }>;

  updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  updateAll<R = Schema['$inferSelect']>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<R> }>;

  updateBy(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  updateBy<R = Schema['$inferSelect']>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<R> }>;

  deleteById(opts: {
    id: IdType;
    options: ExtraOptions & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;
  deleteById<R = Schema['$inferSelect']>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: R }>;

  deleteAll(opts: {
    where?: TWhere<DataObject>;
    options: ExtraOptions & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  deleteAll<R = Schema['$inferSelect']>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<R> }>;

  deleteBy(opts: {
    where?: TWhere<DataObject>;
    options: ExtraOptions & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  deleteBy<R = Schema['$inferSelect']>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<R> }>;
}

// --------------------------------------------------------------------------------------
export interface IQueryHandlerOptions<T = any> {
  column: Column;
  value: T;
}
