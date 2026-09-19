import type { IdType } from '@venizia/ignis-kernel';
import { RelationTypes } from '@venizia/ignis-kernel';
import type { TRelationConfig } from '@/relational/core/repositories/common';
import type { TValueOrResolver } from '@venizia/ignis-helpers/common';
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

/** The drizzle relation options for a given relation type, as its helper declares them. */
export type TRelationMetadata<Type extends TRelationConfig['type']> = Extract<
  TRelationConfig,
  { type: Type }
>['metadata'];

export interface IManyRelation<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
  type: typeof RelationTypes.MANY;
  schema: Schema;
  metadata?: TRelationMetadata<typeof RelationTypes.MANY>;
}

export interface IOneRelation<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
  type: typeof RelationTypes.ONE;
  schema: Schema;
  metadata?: TRelationMetadata<typeof RelationTypes.ONE>;
}

export type TRelationDefinition = IManyRelation | IOneRelation;

/**
 * Relations keyed by name. Each points at a SCHEMA, never at another entity: an entity reference
 * across two files that import each other collapses to `any` under TS7022, silently.
 */
export type TRelationDefinitions = Record<string, TRelationDefinition>;

/** The entity shape {@link TEntityObject} reads. */
export interface IDefinedEntity<
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  Relations extends TRelationDefinitions = TRelationDefinitions,
> {
  schema: Schema;
  relationDefinitions: Relations;
}

/** A row of the entity plus its relations, so a relation is declared once instead of twice. */
export type TEntityObject<Entity extends IDefinedEntity> = TTableObject<Entity['schema']> & {
  [Name in keyof Entity['relationDefinitions']]?: Entity['relationDefinitions'][Name] extends {
    type: typeof RelationTypes.MANY;
  }
    ? Array<TTableObject<Entity['relationDefinitions'][Name]['schema']>>
    : TTableObject<Entity['relationDefinitions'][Name]['schema']>;
};
