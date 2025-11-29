import { IsPrimaryKey, NotNull } from 'drizzle-orm';
import { PgColumnBuilderBase } from 'drizzle-orm/pg-core';

// ----------------------------------------------------------------------------------------------------------------------------------------
export type NumberIdType = number;
export type StringIdType = string;
export type IdType = string | number;

export type TColumnDefinition = PgColumnBuilderBase;
export type TColumns = { [field: string | symbol]: TColumnDefinition };
export type TPrimaryKey<T extends TColumnDefinition> = IsPrimaryKey<NotNull<T>>;

/* export type TEnricher = <
  ColumnDefinitions extends TColumns,
  Options extends object = {},
  EnrichedDefinitions extends TColumns = TColumns,
>(
  baseColumns: ColumnDefinitions,
  opts: Options,
) => EnrichedDefinitions; */
