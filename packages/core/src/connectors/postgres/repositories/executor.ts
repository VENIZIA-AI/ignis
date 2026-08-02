import type {
  ICountOptions,
  IInsertOptions,
  IRelationalQueryExecutor,
  IRelationalQueryOptions,
  IRemoveOptions,
  ISelectOptions,
  IUpdateOptions,
  IWriteResult,
} from '@/connectors/relational/repositories/common';
import type { TRelationalConnector } from '@/connectors/postgres/datasources';
import type { AnyType, TNullable } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';
import type { PgTable } from 'drizzle-orm/pg-core';
import omit from 'lodash/omit';

/** Postgres implementation of `IRelationalQueryExecutor`: pure translation from already-built SQL fragments (`where`, `orderBy`, projections) to Drizzle Core API calls. Filter-to-SQL compilation is dialect work and stays in the repository tier - this class only walks the builder chain.
 *
 * Every write verb ends in `rows as Array<R>`: Drizzle infers `returning()`'s row type from the table schema, not from the caller-chosen R; the two are asserted compatible by convention, not provable structurally. */
export class PostgresQueryExecutor implements IRelationalQueryExecutor<TRelationalConnector> {
  async select<R>(opts: ISelectOptions<TRelationalConnector>): Promise<Array<R>> {
    const { connector, table, columns, where, orderBy, limit, offset, lock } = opts;

    // EntitySchema extends TTableSchemaWithId which extends PgTable, but drizzle's `.from()` needs the concrete PgTable type, not the generic bound.
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

    // Drizzle's `$dynamic()` builder infers its row type from the table schema, not from the caller-chosen R; the two are asserted compatible by convention.
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
    // Drizzle's relational result (`PgRelationalQuery<{[x: string]: any}[]>`) doesn't overlap the caller-chosen R enough for a direct assertion - genuinely different shapes bridged at this ORM boundary.
    return queryInterface.findMany(opts.query) as AnyType;
  }

  async findFirst<R>(opts: IRelationalQueryOptions<TRelationalConnector>): Promise<TNullable<R>> {
    const queryInterface = this.getQueryInterface(opts);
    // Drizzle's `findFirst` config type structurally forbids `limit` (it always fetches one row). Defensive, not redundant with the caller's own omit: the type gate applies to whatever any caller passes, and this is the only place that knows about it.
    const queryOptions = omit(opts.query, ['limit']);
    const result = await queryInterface.findFirst(queryOptions);
    // Same drizzle-relational-query-vs-caller-generic boundary as findMany above.
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

  /** Gets the Drizzle relational-query interface, validating schema registration. Ported from the repository tier's `getQueryInterface` - the error wording names the entity and lists the available keys, and is asserted by a test word for word. */
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

  /** Rows affected by a write executed without RETURNING. Reads `pg`'s `rowCount` or postgres-js's `count` off the raw driver result - engine-specific knowledge the shared repository tier must not hold. Behaviour copied from `@/utilities#readAffectedRowCount`, which stays in place for its existing callers. */
  private readAffectedRowCount(opts: { result: unknown }): number {
    const { result } = opts;

    // Drizzle resolves some statements to nothing at all; the callers already treated that as zero.
    if (result === null || result === undefined) {
      return 0;
    }

    if (typeof result !== 'object') {
      throw getError({
        message: `[readAffectedRowCount] Unrecognized driver result | expected pg.QueryResult or postgres-js RowList | got: ${typeof result}`,
      });
    }

    const { rowCount, count } = result as { rowCount?: unknown; count?: unknown };

    // node-postgres. `rowCount` is null for statements that affect no rows by definition (e.g. DDL).
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

    throw getError({
      message: `[readAffectedRowCount] Unrecognized driver result | expected 'rowCount' (node-postgres) or 'count' (postgres-js) | got keys: ${Object.keys(result).join(', ')}`,
    });
  }
}
