import { IDataSource } from "@/base/datasources";
import { BaseEntity, IdType, TTableInsert, TTableObject, TTableSchemaWithId } from "@/base/models";
import { z } from "@hono/zod-openapi";
import { TNullable } from "@venizia/ignis-helpers";
import { Column, SQL, createTableRelationsHelpers } from "drizzle-orm";
import { Sorts } from "../operators";
import { DEFAULT_LIMIT, RelationTypes } from "./constants";

// ---------------------------------------------------------------------------
// Repository Interfaces
// ---------------------------------------------------------------------------
export const SkipSchema = z
  .number()
  .optional()
  .default(0)
  .openapi({
    description: "Number of items to skip for pagination. Default is 0.",
    examples: [1, 2, 3],
  });
export type TSkip = z.infer<typeof SkipSchema>;

// ---------------------------------------------------------------------------
export const OffsetSchema = z
  .number()
  .optional()
  .default(0)
  .openapi({
    description: "Number of items to offset for pagination. Default is 0.",
    examples: [1, 2, 3],
  });
export type TOffset = z.infer<typeof OffsetSchema>;

// ---------------------------------------------------------------------------
export const LimitSchema = z
  .number()
  .optional()
  .default(DEFAULT_LIMIT)
  .openapi({
    description: "Maximum number of items to return. Default is 10.",
    examples: [1, 2, 3],
  });
export type TLimit = z.infer<typeof LimitSchema>;

// ---------------------------------------------------------------------------
export const OrderBySchema = z
  .array(z.string())
  .optional()
  .openapi({
    description: "Sorting order for results, e.g., 'fieldName ASC' or 'fieldName DESC'.",
    examples: [
      ["id", Sorts.DESC].join(" "),
      ["field", `direction (${Sorts.ASC} | ${Sorts.DESC})`].join(" "),
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
    type: "object",
    description: "Query conditions for selecting data.",
  });

export type TWhere<T = any> = { [key in keyof T]?: any } & { and?: TWhere<T>[]; or?: TWhere<T>[] };

// ---------------------------------------------------------------------------
export const FieldsSchema = z
  .record(z.string(), z.boolean())
  .optional()
  .openapi({
    description:
      "Fields selection object - keys are field names, values are boolean (true to include)",
    examples: [
      JSON.stringify({ id: true, name: true }),
      JSON.stringify({ id: true, name: true, email: true }),
      JSON.stringify({ id: true, name: true, email: true, fullName: false }),
    ],
  });
// export type TFields = z.infer<typeof FieldsSchema>;

export type TFields<T = any> = Partial<{ [K in keyof T]: boolean }>;

// ---------------------------------------------------------------------------
export const InclusionSchema = z
  .array(
    z.object({
      relation: z.string().openapi({ description: "Model relation name" }),
      scope: z
        .lazy(() => FilterSchema) // eslint-disable-line @typescript-eslint/no-use-before-define
        .optional()
        .openapi({ description: "Model relation filter" }),
    }),
  )
  .optional()
  .openapi({
    description: "Define related models to include in the response.",
    examples: [
      JSON.stringify({ include: [{ relation: "posts" }] }),
      JSON.stringify({ include: [{ relation: "posts", scope: { limit: 5 } }] }),
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
    type: "object",
    description:
      "A comprehensive filter object for querying data, including conditions, field selection, relations, pagination, and sorting.",
    examples: [
      JSON.stringify({ where: { name: "John Doe" }, limit: 10 }),
      JSON.stringify({ fields: { id: true, name: true, email: true }, order: ["createdAt DESC"] }),
      JSON.stringify({ include: [{ relation: "posts", scope: { limit: 5 } }] }),
      JSON.stringify({
        where: { or: [{ status: "active" }, { isPublished: true }] },
        skip: 20,
        limit: 10,
      }),
      JSON.stringify({ where: { and: [{ role: "admin" }, { createdAt: { gte: "YYYY-MM-DD" } }] } }),
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
  description: "Total count of items matching the criteria.",
  examples: [{ count: 0 }, { count: 10 }],
});
export type TCount = z.infer<typeof CountSchema>;

// ---------------------------------------------------------------------------
export type TDrizzleQueryOptions = Partial<{
  limit: number;
  offset: number;
  orderBy: SQL[];
  where: SQL;
  with: Record<string, boolean | TDrizzleQueryOptions>;
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

// ---------------------------------------------------------------------------
export interface IRepository<EntitySchema extends TTableSchemaWithId> {
  dataSource: IDataSource;
  entity: BaseEntity<EntitySchema>;
  relations: { [relationName: string]: TRelationConfig };

  getEntity(): BaseEntity<EntitySchema>;
  getEntitySchema(): EntitySchema;
  getConnector(): IDataSource["connector"];
}

export interface IReadableRepository<
  EntitySchema extends TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  ExtraOptions extends TNullable<object> = undefined,
> extends IRepository<EntitySchema> {
  buildQuery(opts: { filter: TFilter<DataObject> }): TDrizzleQueryOptions;

  count(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<TCount>;
  existsWith(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<boolean>;

  find(opts: { filter: TFilter<DataObject>; options?: ExtraOptions }): Promise<Array<DataObject>>;
  findOne(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<TNullable<DataObject>>;
  findById(opts: {
    id: IdType;
    filter?: Exclude<TFilter<DataObject>, "where">;
    options?: ExtraOptions;
  }): Promise<TNullable<DataObject>>;
}

export interface IPersistableRepository<
  EntitySchema extends TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends TNullable<object> = undefined,
> extends IReadableRepository<EntitySchema, DataObject, ExtraOptions> {
  create(opts: {
    data: PersistObject;
    options?: (ExtraOptions | {}) & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<EntitySchema["$inferSelect"]> }>;
  createAll(opts: {
    data: Array<PersistObject>;
    options?: (ExtraOptions | {}) & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema["$inferSelect"]>> }>;

  updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: (ExtraOptions | {}) & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<EntitySchema["$inferSelect"]> }>;
  updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema["$inferSelect"]>> }>;
  updateBy(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema["$inferSelect"]>> }>;

  deleteById(opts: {
    id: IdType;
    options?: (ExtraOptions | {}) & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<EntitySchema["$inferSelect"]> }>;
  deleteAll(opts: {
    where?: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema["$inferSelect"]>> }>;
  deleteBy(opts: {
    where?: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema["$inferSelect"]>> }>;
}

// --------------------------------------------------------------------------------------
export interface IQueryHandlerOptions<T = any> {
  column: Column;
  value: T;
}

/* export interface ITzRepository<E extends TBaseTzEntity> extends IPersistableRepository<E> {
  mixTimestamp(entity: DataObject<E>, options?: { newInstance: boolean }): DataObject<E>;
  mixUserAudit(
    entity: DataObject<E>,
    options?: { newInstance: boolean; authorId: IdType },
  ): DataObject<E>;
} */
