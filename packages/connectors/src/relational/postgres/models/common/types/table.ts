import type { IdType } from '@venizia/ignis-kernel';
import type { TRelationConfig } from '@/relational/postgres/repositories/common';
import type { TValueOrResolver } from '@venizia/ignis-helpers/common';
import type { IsPrimaryKey, NotNull } from 'drizzle-orm';
import type { AnyPgColumn, PgColumnBuilderBase, PgTable, TableConfig } from 'drizzle-orm/pg-core';

/** A single Postgres column builder, as passed to `pgTable`. */
export type TColumnDefinition = PgColumnBuilderBase;
/** A map of field names to Postgres column builders. */
export type TColumnDefinitions = {
  [field: string | symbol]: TColumnDefinition;
};
/** Marks the column builder `T` as a not-null primary key. */
export type TPrimaryKey<T extends TColumnDefinition> = IsPrimaryKey<NotNull<T>>;

/** A Postgres column whose data type is `IdType`. */
export type TIdColumn = AnyPgColumn<{ data: IdType }>;
/** A Postgres table that has an `id` column; the bound for a model schema. */
export type TTableSchemaWithId<TC extends TableConfig = TableConfig> = PgTable<TC> & {
  id: TIdColumn;
};

/** The row shape a select returns for the table `T`. */
export type TTableObject<T extends TTableSchemaWithId> = T['$inferSelect'];

/** The type of the `id` column of the table `T`. */
export type TGetIdType<T extends TTableSchemaWithId> = TTableObject<T>['id'];

// The neutral constraint is `Table`-branded, so it is wider than the `PgTable`-branded one here
// and every postgres caller still satisfies it.
export { RelationalEntityUtility } from '@/relational/core/models/common/types';

/** The row shape an insert takes for the table `T`. */
export type TTableInsert<T extends TTableSchemaWithId> = T['$inferInsert'];

/** Static schema + relations contract every entity model implements. */
export interface IEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
  TABLE_NAME?: string;
  schema: Schema;
  relations?: TValueOrResolver<Array<TRelationConfig>>;
}
