import type { TConstValue } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { Name, SQL } from 'drizzle-orm';
import { getTableName, is, sql, Table } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';

/** Walk direction relative to `rootId`: DOWN follows `parentColumn -> idColumn` (descendants), UP follows the reverse (ancestors). */
export class RecursiveTreeDirections {
  static readonly UP = 'UP';
  static readonly DOWN = 'DOWN';
  static readonly SCHEME_SET = new Set([this.UP, this.DOWN]);

  static isValid(direction: string): boolean {
    return this.SCHEME_SET.has(direction);
  }
}

export type TRecursiveTreeDirection = TConstValue<typeof RecursiveTreeDirections>;

/** Internal only - not part of {@link IRecursiveTreeOptions}. Derived from `table`, never accepted as an option. */
class RecursiveTreeEngines {
  static readonly POSTGRES = 'POSTGRES';
  static readonly SQLITE = 'SQLITE';
  static readonly SCHEME_SET = new Set([this.POSTGRES, this.SQLITE]);
}

type TRecursiveTreeEngine = TConstValue<typeof RecursiveTreeEngines>;

/** A SQL identifier is safe to splice only after it matches this allowlist - see {@link RecursiveTreeSql.assertValidIdentifier}. */
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * ASCII Unit Separator (0x1F) - chosen because it does not occur in real ids, unlike `/` or `,`.
 * See {@link RecursiveTreeSql} for the exactness limitation this relies on.
 */
const SQLITE_PATH_DELIMITER = sql.raw('char(31)');

export interface IRecursiveTreeOptions {
  /** CTE name the caller references in the SELECT it writes around this fragment. */
  name: string;

  /** Runtime-checked with `is(table, Table)`; also the sole dialect selector (Postgres vs SQLite) - see {@link RecursiveTreeSql}. */
  table: unknown;
  rootId: string;
  direction: TRecursiveTreeDirection;

  /**
   * Counts EDGES, not rows: the root is at depth 0, so `N` returns up to `N+1` rows.
   * No default - `0` type-checks but silently produces an empty result, so `walk` throws at
   * runtime for `maxDepth <= 0`.
   */
  maxDepth: number;
  idColumn?: string;
  parentColumn?: string;

  /** Extra columns, beyond `idColumn`/`parentColumn`, carried into every row of the walk. */
  columns?: string[];

  /** ANDed into the recursive term's WHERE clause - build it with Drizzle's own `sql` tag. */
  recursiveFilter?: SQL;

  /**
   * Emits `path`/`is_cycle` and stops expanding once a row re-visits an id in its own path. Row
   * shape differs per engine and nothing in this signature shows it: Postgres returns a real array
   * and boolean; SQLite returns delimited text and `1`/`0` - so `row.path.length` throws on SQLite
   * and `row.is_cycle === true` is always false there.
   */
  trackPath?: boolean;
  startDepth?: number;
}

/**
 * Returns the CTE definition only - the caller writes its own `SELECT ... FROM <name>` around it.
 * Engine is read off `table`, never asked of the caller, so no option can disagree with the schema.
 * SQLite's `path` is `char(31)`-delimited text, not an array: exact unless an id contains that byte,
 * which this class does not reject. Identifiers cannot be parameterized, so `name`/`idColumn`/
 * `parentColumn`/`columns` are allowlist-checked before reaching a template.
 */
export class RecursiveTreeSql {
  private static assertValidIdentifier(opts: { field: string; value: string }): void {
    const { field, value } = opts;

    if (!IDENTIFIER_PATTERN.test(value)) {
      throw getError({
        message: `[RecursiveTreeSql.walk] Invalid '${field}' | Expected letters, digits and underscores only, not starting with a digit | Got: ${value}`,
      });
    }
  }

  static walk(opts: IRecursiveTreeOptions): SQL {
    const {
      name,
      table,
      rootId,
      direction,
      maxDepth,
      idColumn = 'id',
      parentColumn = 'parent_id',
      columns = [],
      recursiveFilter,
      trackPath = false,
      startDepth = 0,
    } = opts;

    RecursiveTreeSql.assertValidIdentifier({ field: 'name', value: name });
    RecursiveTreeSql.assertValidIdentifier({ field: 'idColumn', value: idColumn });
    RecursiveTreeSql.assertValidIdentifier({ field: 'parentColumn', value: parentColumn });
    columns.forEach(column =>
      RecursiveTreeSql.assertValidIdentifier({ field: 'columns', value: column }),
    );

    if (!RecursiveTreeDirections.isValid(direction)) {
      throw getError({
        message: `[RecursiveTreeSql.walk] Invalid 'direction' | Expected ${RecursiveTreeDirections.UP} or ${RecursiveTreeDirections.DOWN} | Got: ${direction}`,
      });
    }

    if (!Number.isInteger(maxDepth) || maxDepth <= 0) {
      throw getError({
        message: `[RecursiveTreeSql.walk] Invalid 'maxDepth' | Expected a positive integer | Got: ${maxDepth}`,
      });
    }

    if (!is(table, Table)) {
      throw getError({
        message: `[RecursiveTreeSql.walk] Invalid 'table' | Expected a Drizzle table | Got: ${typeof table}`,
      });
    }

    const engine = RecursiveTreeSql.detectEngine(table);

    const tableName = getTableName(table);
    RecursiveTreeSql.assertValidIdentifier({ field: 'table', value: tableName });

    const tableIdentifier = sql.identifier(tableName);
    const cteIdentifier = sql.identifier(name);
    const idIdentifier = sql.identifier(idColumn);
    const parentIdentifier = sql.identifier(parentColumn);
    const extraIdentifiers = columns.map(column => sql.identifier(column));

    const baseColumnList = sql.join([idIdentifier, parentIdentifier, ...extraIdentifiers], sql`, `);
    const recursiveColumnList = sql.join(
      [idIdentifier, parentIdentifier, ...extraIdentifiers].map(identifier => sql`t.${identifier}`),
      sql`, `,
    );

    const depthCast = RecursiveTreeSql.compileDepthCast({ engine, depth: startDepth });
    const { basePathColumns, recursivePathColumns } = trackPath
      ? RecursiveTreeSql.compileCycleGuardFragments({ engine, idIdentifier })
      : { basePathColumns: sql``, recursivePathColumns: sql`` };

    const baseCase = sql`SELECT ${baseColumnList}, ${depthCast} AS depth${basePathColumns} FROM ${tableIdentifier} WHERE ${idIdentifier} = ${rootId}`;

    // DOWN walks parent -> children (t.parentColumn = r.idColumn); UP walks child -> parent (t.idColumn = r.parentColumn).
    const joinCondition =
      direction === RecursiveTreeDirections.DOWN
        ? sql`t.${parentIdentifier} = r.${idIdentifier}`
        : sql`t.${idIdentifier} = r.${parentIdentifier}`;

    // `NOT r.is_cycle` stops expanding a row already flagged cyclic - the row itself stays in the
    // result set with is_cycle = true, only its own children are cut off.
    const cycleGuard = trackPath ? sql` AND NOT r.is_cycle` : sql``;
    const extraFilter = recursiveFilter ? sql` AND (${recursiveFilter})` : sql``;

    const recursiveCase = sql`SELECT ${recursiveColumnList}, r.depth + 1${recursivePathColumns} FROM ${tableIdentifier} t JOIN ${cteIdentifier} r ON ${joinCondition} WHERE r.depth + 1 <= ${maxDepth}${cycleGuard}${extraFilter}`;

    return sql`WITH RECURSIVE ${cteIdentifier} AS (${baseCase} UNION ALL ${recursiveCase})`;
  }

  /** See {@link RecursiveTreeSql} for why there is no separate `engine` option. */
  private static detectEngine(table: Table): TRecursiveTreeEngine {
    if (is(table, PgTable)) {
      return RecursiveTreeEngines.POSTGRES;
    }

    if (is(table, SQLiteTable)) {
      return RecursiveTreeEngines.SQLITE;
    }

    throw getError({
      message: `[RecursiveTreeSql.walk] Invalid 'table' | Expected a Postgres or SQLite Drizzle table | Got: ${getTableName(table)}`,
    });
  }

  /** Postgres needs an explicit cast so the base and recursive terms agree on the `depth` column's type; SQLite's looser typing does not, but casts anyway for parity and to fail loudly on a non-numeric `startDepth`. */
  private static compileDepthCast(opts: { engine: TRecursiveTreeEngine; depth: number }): SQL {
    const { engine, depth } = opts;

    switch (engine) {
      case RecursiveTreeEngines.POSTGRES: {
        return sql`${depth}::int`;
      }
      case RecursiveTreeEngines.SQLITE: {
        return sql`CAST(${depth} AS INTEGER)`;
      }
      default: {
        throw getError({
          message: `[RecursiveTreeSql.walk] Invalid 'engine' | Got: ${engine}`,
        });
      }
    }
  }

  /** See {@link RecursiveTreeSql} for why Postgres and SQLite need different `path`/`is_cycle` shapes. */
  private static compileCycleGuardFragments(opts: {
    engine: TRecursiveTreeEngine;
    idIdentifier: Name;
  }): { basePathColumns: SQL; recursivePathColumns: SQL } {
    const { engine, idIdentifier } = opts;

    switch (engine) {
      case RecursiveTreeEngines.POSTGRES: {
        return {
          basePathColumns: sql`, ARRAY[${idIdentifier}] AS path, false AS is_cycle`,
          recursivePathColumns: sql`, r.path || t.${idIdentifier} AS path, t.${idIdentifier} = ANY(r.path) AS is_cycle`,
        };
      }
      case RecursiveTreeEngines.SQLITE: {
        return {
          basePathColumns: sql`, ${SQLITE_PATH_DELIMITER} || ${idIdentifier} || ${SQLITE_PATH_DELIMITER} AS path, 0 AS is_cycle`,
          recursivePathColumns: sql`, r.path || t.${idIdentifier} || ${SQLITE_PATH_DELIMITER} AS path, instr(r.path, ${SQLITE_PATH_DELIMITER} || t.${idIdentifier} || ${SQLITE_PATH_DELIMITER}) > 0 AS is_cycle`,
        };
      }
      default: {
        throw getError({
          message: `[RecursiveTreeSql.walk] Invalid 'engine' | Got: ${engine}`,
        });
      }
    }
  }
}
