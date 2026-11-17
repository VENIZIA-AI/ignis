import type { IdType } from '@venizia/ignis-kernel';
import type { TRelationConfig } from '@/relational/core/repositories/common';
import type { TValueOrResolver } from '@venizia/ignis-helpers/common';
import type { IsPrimaryKey, NotNull } from 'drizzle-orm';
import type {
  AnySQLiteColumn,
  SQLiteColumnBuilderBase,
  SQLiteTable,
  TableConfig,
} from 'drizzle-orm/sqlite-core';

/** A single SQLite column builder, as passed to `sqliteTable`. */
export type TColumnDefinition = SQLiteColumnBuilderBase;
/** A map of field names to SQLite column builders. */
export type TColumnDefinitions = {
  [field: string | symbol]: TColumnDefinition;
};
/** Marks the column builder `T` as a not-null primary key. */
export type TPrimaryKey<T extends TColumnDefinition> = IsPrimaryKey<NotNull<T>>;

/** A SQLite column whose data type is `IdType`. */
export type TIdColumn = AnySQLiteColumn<{ data: IdType }>;

// Declared here rather than re-exported from the neutral tier: this bound and the `TTableObject`
// beside it must carry the same `SQLiteTable` brand, or a consumer intersecting them hits TS2344.
/** A SQLite table that has an `id` column; the bound for a model schema. */
export type TTableSchemaWithId<TC extends TableConfig = TableConfig> = SQLiteTable<TC> & {
  id: TIdColumn;
};

/** The row shape a select returns for the table `T`. */
export type TTableObject<T extends TTableSchemaWithId> = T['$inferSelect'];

/** The type of the `id` column of the table `T`. */
export type TGetIdType<T extends TTableSchemaWithId> = TTableObject<T>['id'];

// The neutral constraint is `Table`-branded, so it is wider than the `SQLiteTable`-branded one here
// and every sqlite caller still satisfies it.
export { RelationalEntityUtility } from '@/relational/core/models/common/types';

/** The row shape an insert takes for the table `T`. */
export type TTableInsert<T extends TTableSchemaWithId> = T['$inferInsert'];

/** Static schema + relations contract every entity model implements. */
export interface IEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
  TABLE_NAME?: string;
  schema: Schema;
  relations?: TValueOrResolver<Array<TRelationConfig>>;
}
