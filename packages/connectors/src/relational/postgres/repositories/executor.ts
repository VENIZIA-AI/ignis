import { ObjectUtility } from '@venizia/ignis-helpers/common';
import type {
  ICountOptions,
  IInsertOptions,
  IRelationalQueryExecutor,
  IRelationalQueryOptions,
  IRemoveOptions,
  ISelectOptions,
  IUpdateOptions,
  IWriteResult,
} from '@/relational/core/repositories/common';
import type { TRelationalConnector } from '@/relational/postgres/datasources';
import type { TNullable } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { AnyColumn } from 'drizzle-orm';
import { is, SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Translates already-built SQL fragments (`where`, `orderBy`, projections) to Drizzle Core calls.
 * Filter-to-SQL compilation is dialect work and stays in the repository tier.
 *
 * The `rows as Array<R>` every write verb ends in is convention, not proof: Drizzle infers
 * `returning()`'s row type from the table schema, not from the caller-chosen R.
 */
export class PostgresQueryExecutor implements IRelationalQueryExecutor<TRelationalConnector> {
  readonly supportsRowLock = true;

  async select<R>(opts: ISelectOptions<TRelationalConnector>): Promise<Array<R>> {
    const { connector, table, columns, where, orderBy, limit, offset, lock } = opts;

    let query = columns
      ? connector.select(this.toSelectedFields({ columns })).from(table).$dynamic()
      : connector.select().from(table).$dynamic();

    if (where) {
      query = query.where(where);
    }

    if (orderBy && orderBy.length > 0) {
      query = query.orderBy(...orderBy);
    }

    if (limit !== undefined) {
      query = query.limit(limit);
    }

    if (offset !== undefined) {
      query = query.offset(offset);
    }

    // `$dynamic()` infers its row type from the table schema, not from the caller-chosen R.
    if (lock) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `$dynamic()` types its rows from the table schema, not from the caller's `R`
      return query.for(lock.strength, lock.config) as Promise<Array<R>>;
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `$dynamic()` types its rows from the table schema, not from the caller's `R`
    return query as Promise<Array<R>>;
  }

  async count(opts: ICountOptions<TRelationalConnector>): Promise<number> {
    const { connector, table, where } = opts;

    return connector.$count(table, where);
  }

  async findMany<R>(opts: IRelationalQueryOptions<TRelationalConnector>): Promise<Array<R>> {
    const queryInterface = this.getQueryInterface(opts);

    // Same drizzle-relational-query-versus-caller-generic boundary as `findFirst` below.
    const rows = await queryInterface.findMany(opts.query);

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Drizzle's relational query types its rows from the schema, not from the caller's `R`
    return rows as Array<R>;
  }

  async findFirst<R>(opts: IRelationalQueryOptions<TRelationalConnector>): Promise<TNullable<R>> {
    const queryInterface = this.getQueryInterface(opts);

    // Drizzle's `findFirst` config type structurally forbids `limit` - it always fetches one row.
    // This is the only place that knows that, so the strip happens here whatever the caller passed.
    const queryOptions = ObjectUtility.omit({ source: opts.query, keys: ['limit'] });
    const result = await queryInterface.findFirst(queryOptions);

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Drizzle's relational query types its row from the schema, not from the caller's `R`
    return (result ?? null) as TNullable<R>;
  }

  async insert<R>(opts: IInsertOptions<TRelationalConnector>): Promise<IWriteResult<R>> {
    const { connector, table, values, returning, shouldReturn, onConflict } = opts;
    const inserted = connector.insert(table).values(values);
    // `onConflictDoUpdate` returns the same builder; its type only drops the conflict methods, which `inserted` also satisfies.
    const query: ReturnType<typeof inserted.onConflictDoUpdate> = onConflict
      ? inserted.onConflictDoUpdate({
          target: this.toConflictTarget({ columns: onConflict.target }),
          targetWhere: onConflict.targetWhere,
          set: onConflict.set,
          setWhere: onConflict.setWhere,
        })
      : inserted;

    if (!shouldReturn) {
      const result = await query;

      return { count: this.readAffectedRowCount({ result }), rows: [] };
    }

    const pending = returning
      ? query.returning(this.toSelectedFields({ columns: returning }))
      : query.returning();
    const rows = await pending;

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the caller names the row type of the query; the driver types rows loosely and nothing here checks them
    return { count: rows.length, rows: rows as Array<R> };
  }

  async update<R>(opts: IUpdateOptions<TRelationalConnector>): Promise<IWriteResult<R>> {
    const { connector, table, data, where, returning, shouldReturn } = opts;
    const query = connector.update(table).set(data).where(where);

    if (!shouldReturn) {
      const result = await query;

      return { count: this.readAffectedRowCount({ result }), rows: [] };
    }

    const pending = returning
      ? query.returning(this.toSelectedFields({ columns: returning }))
      : query.returning();
    const rows = await pending;

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the caller names the row type of the query; the driver types rows loosely and nothing here checks them
    return { count: rows.length, rows: rows as Array<R> };
  }

  async remove<R>(opts: IRemoveOptions<TRelationalConnector>): Promise<IWriteResult<R>> {
    const { connector, table, where, returning, shouldReturn } = opts;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the executor takes any table of the connector contract; this engine's repositories hand it a Postgres table
    const query = connector.delete(table as PgTable).where(where);

    if (!shouldReturn) {
      const result = await query;

      return { count: this.readAffectedRowCount({ result }), rows: [] };
    }

    const pending = returning
      ? query.returning(this.toSelectedFields({ columns: returning }))
      : query.returning();
    const rows = await pending;

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the caller names the row type of the query; the driver types rows loosely and nothing here checks them
    return { count: rows.length, rows: rows as Array<R> };
  }

  /**
   * Gets the Drizzle relational-query interface, validating schema registration. The error wording
   * names the entity and lists the available keys, and a test asserts it word for word.
   */
  private getQueryInterface(opts: IRelationalQueryOptions<TRelationalConnector>) {
    const { connector, entityName } = opts;
    const scope = opts.scope ?? this.constructor.name;

    if (!connector.query) {
      throw getError({
        message: `[${scope}] Connector query interface not available | Ensure datasource is properly configured with schema`,
      });
    }

    const queryInterface = connector.query[entityName];

    if (!queryInterface) {
      const availableKeys = Object.keys(connector.query);
      throw getError({
        message: `[${scope}] Schema key mismatch | Entity name '${entityName}' not found in connector.query | Available keys: [${availableKeys.join(', ')}] | Ensure the model's TABLE_NAME matches the schema registration key`,
      });
    }

    return queryInterface;
  }

  /** The conflict target, narrowed to Postgres columns; a column of another engine cannot name a Postgres key. */
  private toConflictTarget(opts: { columns: AnyColumn[] }): PgColumn[] {
    const { columns } = opts;

    if (!columns.every((column): column is PgColumn => is(column, PgColumn))) {
      throw getError({
        message: '[insert] Invalid conflict target | every target column must be a Postgres column',
      });
    }

    return columns;
  }

  /**
   * The projection a caller built from the table's columns, narrowed to what Drizzle's Postgres
   * builders take. The neutral options carry it as a plain record; a value that is not a Postgres
   * column or an SQL expression cannot name a field of this engine.
   */
  private toSelectedFields(opts: {
    columns: Record<string, unknown>;
  }): Record<string, PgColumn | SQL | SQL.Aliased> {
    const fields: Record<string, PgColumn | SQL | SQL.Aliased> = {};

    for (const [key, value] of Object.entries(opts.columns)) {
      if (!is(value, PgColumn) && !is(value, SQL) && !is(value, SQL.Aliased)) {
        throw getError({
          message: `[toSelectedFields] Invalid column selection | '${key}' must be a Postgres column or an SQL expression`,
        });
      }

      fields[key] = value;
    }

    return fields;
  }

  /**
   * Rows affected by a write executed without RETURNING. Reads `pg`'s `rowCount`, postgres-js's
   * `count` or PGlite's `affectedRows` off the raw driver result - engine knowledge the shared
   * repository tier must not hold.
   */
  private readAffectedRowCount(opts: { result: unknown }): number {
    const { result } = opts;

    // Drizzle resolves some statements to nothing at all; that counts as zero rows.
    if (result === null || result === undefined) {
      return 0;
    }

    if (typeof result !== 'object') {
      throw getError({
        message: `[readAffectedRowCount] Unrecognized driver result | expected pg.QueryResult, postgres-js RowList or a PGlite Results | got: ${typeof result}`,
      });
    }

    const {
      rowCount,
      count,
      affectedRows,
    }: { rowCount?: unknown; count?: unknown; affectedRows?: unknown } = result;

    // node-postgres. `rowCount` is null for statements
    // that affect no rows by definition (e.g. DDL).
    if (typeof rowCount === 'number') {
      return rowCount;
    }

    if (rowCount === null) {
      return 0;
    }

    // postgres-js.
    if (typeof count === 'number') {
      return count;
    }

    // PGlite - it carries no `rowCount` at all, so without this
    // branch every write with `shouldReturn: false` throws.
    if (typeof affectedRows === 'number') {
      return affectedRows;
    }

    throw getError({
      message: `[readAffectedRowCount] Unrecognized driver result | expected 'rowCount' (node-postgres), 'count' (postgres-js) or 'affectedRows' (PGlite) | got keys: ${Object.keys(result).join(', ')}`,
    });
  }
}
