import type { IdType } from '@/base/models';
import type { TRelationConfig } from '@/connectors/relational/repositories/common';
import type { TValueOrResolver } from '@venizia/ignis-helpers';
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
export { getIdType } from '@/connectors/relational/models/common/types';

export type TTableInsert<T extends TTableSchemaWithId> = T['$inferInsert'];

/** Static schema + relations contract every entity model implements. */
export interface IEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
  TABLE_NAME?: string;
  schema: Schema;
  relations?: TValueOrResolver<Array<TRelationConfig>>;
}

export type TDataTypeEnricherOptions = {
  defaultValue: Partial<{
    dataType: string;
    nValue: number;
    tValue: string;
    bValue: Buffer;
    jValue: object;
    boValue: boolean;
  }>;
};

/**
 * SQLite has no sequences or identity columns - an integer primary key is the table's rowid, which
 * the engine assigns. `autoIncrement` maps to `AUTOINCREMENT`, which additionally forbids reusing a
 * deleted row's id, matching Postgres `generatedAlwaysAsIdentity`.
 */
export type TIdEnricherOptions = {
  id?:
    | { dataType: 'string'; generator?: () => string }
    | { dataType: 'number'; autoIncrement?: boolean };
};

export type TPrincipalEnricherOptions<
  Discriminator extends string = string,
  PolymorphicIdType extends 'number' | 'string' = 'number' | 'string',
  Nullable extends boolean = false,
> = {
  discriminator?: Discriminator;
  defaultPolymorphic?: string;
  polymorphicIdType: PolymorphicIdType;
  isNullableId?: Nullable;
};

/**
 * No `withTimezone` twin of the Postgres options: with no `timestamptz`, every timestamp is an ISO
 * 8601 UTC string carrying its own offset. Omitting `enable` opts the column IN - only
 * `enable: false` drops it. Omitting the key keeps the default: `modified` on, `deleted` off.
 */
export type TTzEnricherOptions = {
  created?: { columnName: string };
  modified?: { enable: false } | { enable?: true; columnName: string };
  deleted?: { enable: false } | { enable?: true; columnName: string };
};

export type TUserAuditColumnOpts = {
  dataType: 'string' | 'number';
  columnName: string;
  allowAnonymous?: boolean;
};

export type TUserAuditEnricherOptions = {
  created?: TUserAuditColumnOpts;
  modified?: TUserAuditColumnOpts;
};
