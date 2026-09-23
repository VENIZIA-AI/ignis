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

/**
 * The entity shape {@link TEntityObject} reads: a class whose instances carry their row type, plus
 * its relations. The row is read off the INSTANCE - the class's static `schema` is widened to
 * `Table` on the base, and a row read through it would take `Table`'s index signature and let
 * every unknown key through.
 */
export interface IDefinedEntity<Relations extends TRelationDefinitions = TRelationDefinitions> {
  new (...args: never): { $inferData?: unknown };
  /** Undefined when the entity declares no relations. */
  relationDefinitions: Relations | undefined;
}

type TRowOf<Entity> = Entity extends new (...args: never) => { $inferData?: infer Row }
  ? NonNullable<Row>
  : never;

type TDefinitionsOf<Entity extends IDefinedEntity> = NonNullable<Entity['relationDefinitions']>;

/** A row of the entity plus its relations, so a relation is declared once instead of twice. */
export type TEntityObject<Entity extends IDefinedEntity> = TRowOf<Entity> & {
  [Name in keyof TDefinitionsOf<Entity>]?: TDefinitionsOf<Entity>[Name] extends {
    type: typeof RelationTypes.MANY;
  }
    ? Array<TTableObject<TDefinitionsOf<Entity>[Name]['schema']>>
    : TTableObject<TDefinitionsOf<Entity>[Name]['schema']>;
};
