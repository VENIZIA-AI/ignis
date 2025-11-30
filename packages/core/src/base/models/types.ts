import { InferSelectModel, IsPrimaryKey, NotNull } from 'drizzle-orm';
import { AnyPgColumn, PgColumnBuilderBase, PgTable, TableConfig } from 'drizzle-orm/pg-core';

// ----------------------------------------------------------------------------------------------------------------------------------------
export type NumberIdType = number;
export type StringIdType = string;
export type IdType = string | number;

export type TColumnDefinition = PgColumnBuilderBase;
export type TColumnDefinitions = { [field: string | symbol]: TColumnDefinition };
export type TPrimaryKey<T extends TColumnDefinition> = IsPrimaryKey<NotNull<T>>;

export type TIdColumn = AnyPgColumn<{ data: IdType }>;
export type TTableSchemaWithId<TC extends TableConfig = TableConfig> = PgTable<TC> & {
  id: TIdColumn;
};
export type TTableObject<T extends TTableSchemaWithId> = InferSelectModel<T> & {
  id: T['id']['_']['data'];
};
export type TGetIdType<T extends TTableSchemaWithId> = TTableObject<T>['id'];

/* export type TEnricher = <
  ColumnDefinitions extends TColumns,
  Options extends object = {},
  EnrichedDefinitions extends TColumns = TColumns,
>(
  baseColumns: ColumnDefinitions,
  opts: Options,
) => EnrichedDefinitions; */
