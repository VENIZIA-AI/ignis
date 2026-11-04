import { ResolverUtility } from '@venizia/ignis-helpers/common';
import { RelationTypes } from '@venizia/ignis-kernel';
import type { IModelRegistryEntry } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import type { AnyColumn, Table } from 'drizzle-orm';
import { getTableConfig as getPgTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { getTableConfig as getSqliteTableConfig } from 'drizzle-orm/sqlite-core';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { TTableSchemaWithId } from '@/relational/core/models/common';
import { OneRelations } from '../dialect/relations/one';
import type { TRelationConfig } from './types';

export class ScopeThroughLink {
  /** Hops a `through` chain may have. The boot check refuses a longer one, and a resolution that reaches it throws. */
  static readonly MAX_DEPTH = 5;

  /**
   * The foreign key that joins `schema` to the parent `relation` names: the parent's table, the property of
   * the child that holds the key, and the parent column it references. Read the way the relation itself is
   * built (`OneRelations`), so a key written out or read off the table's foreign key resolves the same.
   * Throws when the relation is missing, is not a `one`, or has no single-column key on this side.
   */
  static of(opts: {
    schema: Table;
    relation: string;
    relations: Record<string, TRelationConfig>;
  }): { parentSchema: TTableSchemaWithId; childProperty: string; parentColumn: AnyColumn } {
    const { schema, relation, relations } = opts;
    const config = relations[relation];
    const table = getTableName(schema);

    if (config?.type !== RelationTypes.ONE) {
      throw getError({
        message: `[ScopeThrough] '${relation}' is not a 'one' relation of ${table}`,
      });
    }

    const resolved = new OneRelations({
      source: schema,
      relations: Object.values(relations),
    }).configFor({ name: config.name, target: config.schema, metadata: config.metadata ?? {} });
    const [childColumn] = resolved?.fields ?? [];
    const [parentColumn] = resolved?.references ?? [];
    const childProperty = Object.entries(getTableColumns(schema)).find(
      ([, column]) => column === childColumn,
    )?.[0];

    if (resolved?.fields.length !== 1 || !childProperty || !parentColumn) {
      throw getError({
        message: `[ScopeThrough] '${relation}' of ${table} needs a foreign key on ${table} to one column of the parent`,
      });
    }

    return { parentSchema: config.schema, childProperty, parentColumn };
  }

  /** The relations a registry entry resolves to, by name. The registry holds them as `unknown[]`: the kernel knows no ORM. */
  static relationsOf(opts: { entry: IModelRegistryEntry }): Record<string, TRelationConfig> {
    const configs = ResolverUtility.resolveValue({
      value: opts.entry.relationsResolver ?? [],
    }) as Array<TRelationConfig>;

    return Object.fromEntries(configs.map((config) => [config.name, config]));
  }

  /** Whether `property` of `schema` leads an index, a primary key or a unique constraint: the shape a semi-join on it needs. */
  static isIndexed(opts: { schema: Table; property: string }): boolean {
    const { schema, property } = opts;
    const column = getTableColumns(schema)[property];
    const config = is(schema, PgTable)
      ? getPgTableConfig(schema)
      : is(schema, SQLiteTable)
        ? getSqliteTableConfig(schema)
        : undefined;

    const leadsWith = (columns: ReadonlyArray<unknown>) => {
      return Reflect.get(columns[0] ?? {}, 'name') === column?.name;
    };

    return (
      column?.primary === true ||
      column?.isUnique === true ||
      config?.indexes.some((item) => leadsWith(item.config.columns)) === true ||
      config?.primaryKeys.some((item) => leadsWith(item.columns)) === true ||
      config?.uniqueConstraints.some((item) => leadsWith(item.columns)) === true
    );
  }
}
