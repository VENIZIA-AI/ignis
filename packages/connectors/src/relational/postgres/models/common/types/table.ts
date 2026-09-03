import type { IdType } from '@venizia/ignis-kernel';
import type { TRelationConfig } from '@/relational/postgres/repositories/common';
import type { TValueOrResolver } from '@venizia/ignis-helpers/common';
import type { IsPrimaryKey, NotNull } from 'drizzle-orm';
import type { AnyPgColumn, PgColumnBuilderBase, PgTable, TableConfig } from 'drizzle-orm/pg-core';

export type TColumnDefinition = PgColumnBuilderBase;
export type TColumnDefinitions = {
  [field: string | symbol]: TColumnDefinition;
};
export type TPrimaryKey<T extends TColumnDefinition> = IsPrimaryKey<NotNull<T>>;

export type TIdColumn = AnyPgColumn<{ data: IdType }>;
export type TTableSchemaWithId<TC extends TableConfig = TableConfig> = PgTable<TC> & {
  id: TIdColumn;
};

export type TTableObject<T extends TTableSchemaWithId> = T['$inferSelect'];

export type TGetIdType<T extends TTableSchemaWithId> = TTableObject<T>['id'];

// The neutral constraint is `Table`-branded, so it is wider than the `PgTable`-branded one here
// and every postgres caller still satisfies it.
export { getIdType } from '@/relational/core/models/common/types';

export type TTableInsert<T extends TTableSchemaWithId> = T['$inferInsert'];

/** Static schema + relations contract every entity model implements. */
export interface IEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
  TABLE_NAME?: string;
  schema: Schema;
  relations?: TValueOrResolver<Array<TRelationConfig>>;
}
