import { EchoUtility } from '@/common/internal';
import { getError } from '@venizia/ignis-helpers/core';
import type { Column, SQL } from 'drizzle-orm';
import { getTableColumns, getTableName, is, SQL as DrizzleSQL } from 'drizzle-orm';
import { getTableConfig as getPgTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { getTableConfig as getSqliteTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { IUniqueKey, TTableColumnKey, TTableSchemaWithId } from './types';

/** One unique-capable declaration as the table config lists it, engine set aside. */
interface IDeclaredKey {
  /** Postgres names an index it was not given a name for itself; such a key cannot be asked for by name. */
  name?: string;
  isUnique: boolean;
  columns: ReadonlyArray<unknown>;
  where?: SQL;
  nullsNotDistinct: boolean;
}

/**
 * Reads unique keys off a Drizzle table. Internal: the `common` barrel does not export this file; the public entry is
 * `UniqueKeys.of`, and the repository reads the primary key through `primaryOf`.
 */
export class UniqueKeyReader {
  /** The unique index, unique constraint or unique column named `index`; throws for a missing, non-unique or expression one. */
  static named<Schema extends TTableSchemaWithId>(opts: {
    table: Schema;
    index: string;
  }): IUniqueKey<Schema> {
    const { table, index } = opts;
    const declared = UniqueKeyReader.listDeclared({ table });
    const refuse = (detail: string) =>
      getError({
        message: `[UniqueKeys][of] Table: ${getTableName(table)} | ${detail} | index: '${EchoUtility.toSafeEcho({ value: String(index) })}'`,
      });

    const found = declared.find((key) => key.name === index);

    if (!found) {
      throw refuse('no index or constraint of the table has this name');
    }

    if (!found.isUnique) {
      throw refuse('the index is not unique');
    }

    const columns = found.columns.map((entry) => {
      const property = UniqueKeyReader.propertyOf({ table, entry });

      if (property === undefined) {
        throw refuse('an expression index cannot be an upsert key: every entry must be a column');
      }

      return property;
    });

    return {
      table,
      name: index,
      columns,
      ...(found.where ? { where: found.where } : {}),
      nullsNotDistinct: found.nullsNotDistinct,
    };
  }

  /** The primary key: the columns of a `primaryKey()` in the extra config, else every column declared `.primaryKey()`. */
  static primaryOf<Schema extends TTableSchemaWithId>(opts: { table: Schema }): IUniqueKey<Schema> {
    const { table } = opts;
    const config = UniqueKeyReader.readConfig({ table });
    const composite = config.primaryKeys.at(0);
    const entries: ReadonlyArray<unknown> = composite
      ? composite.columns
      : Object.values(UniqueKeyReader.columnsOf({ table })).filter((column) => column.primary);
    const columns: Array<TTableColumnKey<Schema>> = [];

    for (const entry of entries) {
      const property = UniqueKeyReader.propertyOf({ table, entry });

      if (property !== undefined) {
        columns.push(property);
      }
    }

    if (columns.length === 0 || columns.length !== entries.length) {
      throw getError({
        message: `[UniqueKeys][primaryOf] Table: ${getTableName(table)} | the table declares no primary key`,
      });
    }

    return {
      table,
      name: composite?.getName() ?? `${getTableName(table)}_pkey`,
      columns,
      nullsNotDistinct: false,
    };
  }

  /** Every unique-capable declaration of the table: its indexes, its unique constraints and its `.unique()` columns. */
  private static listDeclared(opts: { table: TTableSchemaWithId }): IDeclaredKey[] {
    const { table } = opts;
    const config = UniqueKeyReader.readConfig({ table });
    const keys: IDeclaredKey[] = [];

    for (const entry of config.indexes) {
      keys.push({
        name: entry.config.name,
        isUnique: entry.config.unique === true,
        columns: entry.config.columns,
        where: entry.config.where,
        nullsNotDistinct: false,
      });
    }

    for (const constraint of config.uniqueConstraints) {
      keys.push({
        name: constraint.getName(),
        isUnique: true,
        columns: constraint.columns,
        // Postgres only: SQLite has no `NULLS NOT DISTINCT`.
        nullsNotDistinct: 'nullsNotDistinct' in constraint && constraint.nullsNotDistinct === true,
      });
    }

    for (const column of Object.values(UniqueKeyReader.columnsOf({ table }))) {
      if (column.isUnique && column.uniqueName) {
        keys.push({
          name: column.uniqueName,
          isUnique: true,
          columns: [column],
          nullsNotDistinct: column.uniqueType === 'not distinct',
        });
      }
    }

    return keys;
  }

  private static readConfig(opts: { table: TTableSchemaWithId }) {
    const { table } = opts;

    if (is(table, PgTable)) {
      return getPgTableConfig(table);
    }

    if (is(table, SQLiteTable)) {
      return getSqliteTableConfig(table);
    }

    throw getError({
      message: `[UniqueKeys] Table: ${getTableName(table)} | the table is neither a Postgres nor a SQLite table`,
    });
  }

  /**
   * The table property of one key entry. Index entries are copies of the columns (Postgres builds an `IndexedColumn`),
   * so they are matched by database name; an expression (`SQL`) or an unknown name has no property.
   */
  private static propertyOf<Schema extends TTableSchemaWithId>(opts: {
    table: Schema;
    entry: unknown;
  }): TTableColumnKey<Schema> | undefined {
    const { table, entry } = opts;

    if (
      is(entry, DrizzleSQL) ||
      typeof entry !== 'object' ||
      entry === null ||
      !('name' in entry) ||
      typeof entry.name !== 'string'
    ) {
      return undefined;
    }

    const name = entry.name;
    const columns = UniqueKeyReader.columnsOf({ table });

    return Object.keys(columns).find(
      (key): key is TTableColumnKey<Schema> =>
        UniqueKeyReader.isColumnKey(table, key) && columns[key].name === name,
    );
  }

  /** The table's columns by property. */
  static columnsOf(opts: { table: TTableSchemaWithId }): Record<string, Column> {
    return getTableColumns(opts.table);
  }

  /** Whether `key` is a column property of `table`. */
  static isColumnKey<Schema extends TTableSchemaWithId>(
    table: Schema,
    key: string,
  ): key is TTableColumnKey<Schema> {
    return Object.hasOwn(getTableColumns(table), key);
  }
}
