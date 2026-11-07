import type { IdType } from '@venizia/ignis-kernel';
import { type RelationTypes } from '@venizia/ignis-kernel';
import type { TRelationConfig } from '@/relational/core/repositories/common';
import type { TValueOrResolver } from '@venizia/ignis-helpers/common';
import type {
  AnyColumn,
  ColumnBuilderBase,
  IsPrimaryKey,
  NotNull,
  SQL,
  Table,
  TableConfig,
} from 'drizzle-orm';

/** A single Drizzle column builder, whatever the engine. */
export type TColumnDefinition = ColumnBuilderBase;
/** A map of field names to column builders. */
export type TColumnDefinitions = {
  [field: string | symbol]: TColumnDefinition;
};
/** Marks the column builder `T` as a not-null primary key. */
export type TPrimaryKey<T extends TColumnDefinition> = IsPrimaryKey<NotNull<T>>;

/** Any Drizzle column whose runtime value is a valid entity id. Drizzle's root `AnyColumn<TPartial>` is the exact dialect-free twin of `AnyPgColumn<TPartial>`, so this does not widen the bound. */
export type TIdColumn = AnyColumn<{ data: IdType }>;

/** The engine-neutral bound. `PgTable` and `SQLiteTable` both extend `Table`, and `Table` carries `$inferSelect` / `$inferInsert`. */
export type TTableSchemaWithId<TC extends TableConfig = TableConfig> = Table<TC> & {
  id: TIdColumn;
};

/** The row shape a select returns for the table `T`. */
export type TTableObject<T extends TTableSchemaWithId> = T['$inferSelect'];
/** The row shape an insert takes for the table `T`. */
export type TTableInsert<T extends TTableSchemaWithId> = T['$inferInsert'];
/** The type of the `id` column of the table `T`. */
export type TGetIdType<T extends TTableSchemaWithId> = TTableObject<T>['id'];

/** A column property of the table `Schema`: the key it has in the table object, not the database name. */
export type TTableColumnKey<Schema extends TTableSchemaWithId> = keyof Schema['_']['columns'] &
  string;

/**
 * A unique index or unique constraint of one table, read from its Drizzle declaration by `UniqueKeys.of`. It carries the
 * table itself, so a key of one table does not type-check where another table's key is expected, even when the two
 * tables share their column names.
 */
export interface IUniqueKey<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
  /** The table the key belongs to; a repository refuses a key whose table is not its own. */
  readonly table: Schema;
  /** The name of the index or constraint, as declared. */
  readonly name: string;
  /** The key's columns, as table properties, in the declared order. */
  readonly columns: ReadonlyArray<TTableColumnKey<Schema>>;
  /** The predicate of a partial unique index (`uniqueIndex(...).where(...)`), sent as the conflict target's `WHERE`. */
  readonly where?: SQL;
  /** Whether two nulls count as equal for this key (Postgres `NULLS NOT DISTINCT`); a null key column is refused otherwise. */
  readonly nullsNotDistinct: boolean;
}

/** Helpers for reading facts off an entity table schema. */
export class RelationalEntityUtility {
  static getIdType<T extends TTableSchemaWithId>(opts: { entity: T }) {
    return opts.entity?.id?.dataType ?? 'unknown';
  }
}

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

/** A to-many relation to `schema`, as built by `many()`; `metadata` is the Drizzle relation options. */
export interface IManyRelation<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
  type: typeof RelationTypes.MANY;
  schema: Schema;
  metadata?: TRelationMetadata<typeof RelationTypes.MANY>;
}

/** A to-one relation to `schema`, as built by `one()`; `metadata` is the Drizzle relation options. */
export interface IOneRelation<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
  type: typeof RelationTypes.ONE;
  schema: Schema;
  metadata?: TRelationMetadata<typeof RelationTypes.ONE>;
}

/** A relation declared with `many()` or `one()`, before its name is attached. */
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
