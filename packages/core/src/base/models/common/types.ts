import { z } from '@hono/zod-openapi';
import { ErrorSchema, getError, HTTP } from '@venizia/ignis-helpers';
import { IsPrimaryKey, NotNull } from 'drizzle-orm';
import { AnyPgColumn, PgColumnBuilderBase, PgTable, TableConfig } from 'drizzle-orm/pg-core';

// --------------------------------------------------------------------------------------------
export type NumberIdType = number;
export type StringIdType = string;
export type BigIntIdType = bigint;
export type IdType = NumberIdType | StringIdType | BigIntIdType;

// --------------------------------------------------------------------------------------------
export type TColumnDefinition = PgColumnBuilderBase;
export type TColumnDefinitions = { [field: string | symbol]: TColumnDefinition };
export type TPrimaryKey<T extends TColumnDefinition> = IsPrimaryKey<NotNull<T>>;

export type TIdColumn = AnyPgColumn<{ data: IdType }>;
export type TTableSchemaWithId<TC extends TableConfig = TableConfig> = PgTable<TC> & {
  id: TIdColumn;
};

export type TTableObject<T extends TTableSchemaWithId> = T['$inferSelect'];

export type TGetIdType<T extends TTableSchemaWithId> = TTableObject<T>['id'];

export const getIdType = <T extends TTableSchemaWithId>(opts: { entity: T }) => {
  return opts.entity?.id?.dataType ?? 'unknown';
};

export type TTableInsert<T extends TTableSchemaWithId> = T['$inferInsert'];

// --------------------------------------------------------------------------------------------
export const idParamsSchema = (opts?: { idType: string }) => {
  const { idType = 'number' } = opts || {};

  switch (idType) {
    case 'number': {
      return z.object({
        id: z.number().openapi({
          param: {
            name: 'id',
            in: 'path',
            description: 'The unique id of the resource',
          },
          examples: [1, 2, 3],
        }),
      });
    }
    case 'string': {
      return z.object({
        id: z.string().openapi({
          param: {
            name: 'id',
            in: 'path',
            description: 'The unique id of the resource',
          },
          examples: ['4651e634-a530-4484-9b09-9616a28f35e3', 'some_unique_id'],
        }),
      });
    }
    default: {
      throw getError({
        message: `[idParamsSchema] Invalid input idType | valid: [string | number] | idType: ${idType}`,
      });
    }
  }
};

// -------------------------------------------------------------------------
export const jsonContent = <T extends z.ZodType>(opts: {
  schema: T;
  description: string;
  required?: boolean;
}) => {
  return {
    description: opts.description,
    content: { 'application/json': { schema: opts.schema } },
    required: opts.required,
  };
};

export const jsonResponse = <T extends z.ZodType>(opts: {
  schema: T;
  description?: string;
  required?: boolean;
}) => {
  return {
    [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
      required: opts.required,
      description: opts.description ?? 'Success Response',
      schema: opts.schema,
    }),
    ['4xx | 5xx']: jsonContent({ description: 'Error Response', schema: ErrorSchema }),
  };
};
