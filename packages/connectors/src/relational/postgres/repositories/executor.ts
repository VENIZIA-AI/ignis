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
import type { AnyType, TNullable } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { PgTable } from 'drizzle-orm/pg-core';
import omit from 'lodash/omit';

/**
 * Translates already-built SQL fragments (`where`, `orderBy`, projections) to Drizzle Core calls.
 * Filter-to-SQL compilation is dialect work and stays in the repository tier.
 *
 * The `rows as Array<R>` every write verb ends in is convention, not proof: Drizzle infers
 * `returning()`'s row type from the table schema, not from the caller-chosen R.
 */
export class PostgresQueryExecutor implements IRelationalQueryExecutor<TRelationalConnector> {
  async select<R>(opts: ISelectOptions<TRelationalConnector>): Promise<Array<R>> {
    const { connector, table, columns, where, orderBy, limit, offset, lock } = opts;

    // Drizzle's `.from()` needs the concrete `PgTable` type, not the generic bound.
    const pgTable = table as PgTable;

    let query = columns
      ? connector
          .select(columns as AnyType)
          .from(pgTable)
          .$dynamic()
      : connector.select().from(pgTable).$dynamic();

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
      return query.for(lock.strength, lock.config) as Promise<Array<R>>;
    }

    return query as Promise<Array<R>>;
  }

  async count(opts: ICountOptions<TRelationalConnector>): Promise<number> {
    const { connector, table, where } = opts;
    return connector.$count(table as PgTable, where);
  }

  async findMany<R>(opts: IRelationalQueryOptions<TRelationalConnector>): Promise<Array<R>> {
    const queryInterface = this.getQueryInterface(opts);

    // Drizzle's relational result (`PgRelationalQuery<{[x: string]: any}[]>`) does not overlap the
    // caller-chosen R enough for a direct assertion.
    return queryInterface.findMany(opts.query) as AnyType;
  }

  async findFirst<R>(opts: IRelationalQueryOptions<TRelationalConnector>): Promise<TNullable<R>> {
    const queryInterface = this.getQueryInterface(opts);

    // Drizzle's `findFirst` config type structurally forbids `limit` - it always fetches one row.
    // This is the only place that knows that, so the strip happens here whatever the caller passed.
    const queryOptions = omit(opts.query, ['limit']);
    const result = await queryInterface.findFirst(queryOptions);

    // Same drizzle-relational-query-versus-caller-generic boundary as `findMany` above.
    return (result ?? null) as TNullable<R>;
  }

  async insert<R>(opts: IInsertOptions<TRelationalConnector>): Promise<IWriteResult<R>> {
    const { connector, table, values, returning, shouldReturn } = opts;
    const query = connector.insert(table as PgTable).values(values as AnyType);

    if (!shouldReturn) {
      const result = await query;
      return { count: this.readAffectedRowCount({ result }), rows: [] };
    }

    const rows = returning ? await query.returning(returning as AnyType) : await query.returning();
    return { count: rows.length, rows: rows as Array<R> };
  }

  async update<R>(opts: IUpdateOptions<TRelationalConnector>): Promise<IWriteResult<R>> {
    const { connector, table, data, where, returning, shouldReturn } = opts;
    const query = connector
      .update(table as PgTable)
      .set(data as AnyType)
      .where(where);

    if (!shouldReturn) {
      const result = await query;
      return { count: this.readAffectedRowCount({ result }), rows: [] };
    }

    const rows = returning ? await query.returning(returning as AnyType) : await query.returning();
    return { count: rows.length, rows: rows as Array<R> };
  }

  async remove<R>(opts: IRemoveOptions<TRelationalConnector>): Promise<IWriteResult<R>> {
    const { connector, table, where, returning, shouldReturn } = opts;
    const query = connector.delete(table as PgTable).where(where);

    if (!shouldReturn) {
      const result = await query;
      return { count: this.readAffectedRowCount({ result }), rows: [] };
    }

    const rows = returning ? await query.returning(returning as AnyType) : await query.returning();
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

    const { rowCount, count, affectedRows } = result as {
      rowCount?: unknown;
      count?: unknown;
      affectedRows?: unknown;
    };

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
