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

export type TColumnDefinition = SQLiteColumnBuilderBase;
export type TColumnDefinitions = {
  [field: string | symbol]: TColumnDefinition;
};
export type TPrimaryKey<T extends TColumnDefinition> = IsPrimaryKey<NotNull<T>>;

export type TIdColumn = AnySQLiteColumn<{ data: IdType }>;

// Declared here rather than re-exported from the neutral tier: this bound and the `TTableObject`
// beside it must carry the same `SQLiteTable` brand, or a consumer intersecting them hits TS2344.
export type TTableSchemaWithId<TC extends TableConfig = TableConfig> = SQLiteTable<TC> & {
  id: TIdColumn;
};

export type TTableObject<T extends TTableSchemaWithId> = T['$inferSelect'];

export type TGetIdType<T extends TTableSchemaWithId> = TTableObject<T>['id'];

// The neutral constraint is `Table`-branded, so it is wider than the `SQLiteTable`-branded one here
// and every sqlite caller still satisfies it.
export { getIdType } from '@/relational/core/models/common/types';

export type TTableInsert<T extends TTableSchemaWithId> = T['$inferInsert'];

/** Static schema + relations contract every entity model implements. */
export interface IEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
  TABLE_NAME?: string;
  schema: Schema;
  relations?: TValueOrResolver<Array<TRelationConfig>>;
}
