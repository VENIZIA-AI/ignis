import type { IdType } from '@/base/models';
import type { TRelationConfig } from '@/connectors/postgres/repositories/common';
import type { TValueOrResolver } from '@venizia/ignis-helpers/common';
import type { IsPrimaryKey, NotNull } from 'drizzle-orm';
import type {
  AnyPgColumn,
  PgColumnBuilderBase,
  PgSequenceOptions,
  PgTable,
  TableConfig,
} from 'drizzle-orm/pg-core';

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

export type TIdEnricherOptions = {
  id?: { columnName?: string } & (
    | { dataType: 'string'; generator?: () => string }
    | {
        dataType: 'number';
        sequenceOptions?: PgSequenceOptions;
      }
    | {
        dataType: 'big-number';
        numberMode: 'number' | 'bigint';
        sequenceOptions?: PgSequenceOptions;
      }
  );
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

export type TTzEnricherOptions = {
  created?: { columnName: string; withTimezone: boolean };
  modified?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
  deleted?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
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
