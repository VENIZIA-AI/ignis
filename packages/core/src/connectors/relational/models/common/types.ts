import type { IdType } from '@/base/models';
import type { TRelationConfig } from '@/connectors/relational/repositories/common';
import type { TValueOrResolver } from '@venizia/ignis-helpers';
import type {
  AnyColumn,
  ColumnBuilderBase,
  IsPrimaryKey,
  NotNull,
  Table,
  TableConfig,
} from 'drizzle-orm';

export type TColumnDefinition = ColumnBuilderBase;
export type TColumnDefinitions = {
  [field: string | symbol]: TColumnDefinition;
};
export type TPrimaryKey<T extends TColumnDefinition> = IsPrimaryKey<NotNull<T>>;

/** Any Drizzle column whose runtime value is a valid entity id. Drizzle's root `AnyColumn<TPartial>` is the exact dialect-free twin of `AnyPgColumn<TPartial>`, so this does not widen the bound. */
export type TIdColumn = AnyColumn<{ data: IdType }>;

/** The engine-neutral bound. `PgTable` and `SQLiteTable` both extend `Table`, and `Table` carries `$inferSelect` / `$inferInsert`. */
export type TTableSchemaWithId<TC extends TableConfig = TableConfig> = Table<TC> & {
  id: TIdColumn;
};

export type TTableObject<T extends TTableSchemaWithId> = T['$inferSelect'];
export type TTableInsert<T extends TTableSchemaWithId> = T['$inferInsert'];
export type TGetIdType<T extends TTableSchemaWithId> = TTableObject<T>['id'];

export const getIdType = <T extends TTableSchemaWithId>(opts: { entity: T }) => {
  return opts.entity?.id?.dataType ?? 'unknown';
};

/** Static schema + relations contract every entity model implements. */
export interface IEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
  TABLE_NAME?: string;
  schema: Schema;
  relations?: TValueOrResolver<Array<TRelationConfig>>;
}
