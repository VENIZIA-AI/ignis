import type { TTableSchemaWithId } from '@/connectors/relational/models/common';
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
import type { TSqliteConnector } from '@/connectors/sqlite/drivers';
import { throwNotSupported } from '@/utilities';
import type { ILogger } from '@venizia/ignis-helpers/core';
import type { AnyType, TNullable } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { LoggerFactory } from '@venizia/ignis-helpers';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import omit from 'lodash/omit';

/**
 * Translates already-built SQL fragments (`where`, `orderBy`, projections) to Drizzle Core calls.
 * Filter-to-SQL compilation is dialect work and stays in the repository tier.
 *
 * The `rows as Array<R>` every write verb ends in is convention, not proof: Drizzle infers
 * `returning()`'s row type from the table schema, not from the caller-chosen R.
 */
export class SqliteQueryExecutor implements IRelationalQueryExecutor<TSqliteConnector> {
  private readonly logger: ILogger;

  constructor() {
    this.logger = LoggerFactory.getLogger([SqliteQueryExecutor.name]);
  }

  async select<R>(opts: ISelectOptions<TSqliteConnector>): Promise<Array<R>> {
    const { connector, table, columns, where, orderBy, limit, offset, lock } = opts;

    // SQLite locks the whole database file, never a row, so there is no `FOR UPDATE` to
    // emit. A write transaction (`BEGIN IMMEDIATE`) already excludes every other writer.
    if (lock) {
      throwNotSupported({
        scope: SqliteQueryExecutor.name,
        feature: 'Row-level locking (SELECT ... FOR UPDATE)',
        logger: this.logger,
      });
    }

    const sqliteTable = this.asTable({ table });

    let query = columns
      ? connector
          .select(columns as AnyType)
          .from(sqliteTable)
          .$dynamic()
      : connector.select().from(sqliteTable).$dynamic();

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
    return query as Promise<Array<R>>;
  }

  async count(opts: ICountOptions<TSqliteConnector>): Promise<number> {
    const { connector, table, where } = opts;
    return connector.$count(this.asTable({ table }), where);
  }

  async findMany<R>(opts: IRelationalQueryOptions<TSqliteConnector>): Promise<Array<R>> {
    const queryInterface = this.getQueryInterface(opts);

    // Drizzle's relational result does not overlap the
    // caller-chosen R enough for a direct assertion.
    return queryInterface.findMany(opts.query) as AnyType;
  }

  async findFirst<R>(opts: IRelationalQueryOptions<TSqliteConnector>): Promise<TNullable<R>> {
    const queryInterface = this.getQueryInterface(opts);

    // Drizzle's `findFirst` config type structurally forbids `limit` - it always fetches one row.
    // This is the only place that knows that, so the strip happens here whatever the caller passed.
    const queryOptions = omit(opts.query, ['limit']);
    const result = await queryInterface.findFirst(queryOptions);

    // Same drizzle-relational-query-versus-caller-generic boundary as `findMany` above.
    return (result ?? null) as TNullable<R>;
  }

  async insert<R>(opts: IInsertOptions<TSqliteConnector>): Promise<IWriteResult<R>> {
    const { connector, table, values, returning, shouldReturn } = opts;
    const query = connector.insert(this.asTable({ table })).values(values as AnyType);

    if (!shouldReturn) {
      const result = await query;
      return { count: this.readAffectedRowCount({ result }), rows: [] };
    }

    const rows = returning ? await query.returning(returning as AnyType) : await query.returning();
    return { count: rows.length, rows: rows as Array<R> };
  }

  async update<R>(opts: IUpdateOptions<TSqliteConnector>): Promise<IWriteResult<R>> {
    const { connector, table, data, where, returning, shouldReturn } = opts;
    const query = connector
      .update(this.asTable({ table }))
      .set(data as AnyType)
      .where(where);

    if (!shouldReturn) {
      const result = await query;
      return { count: this.readAffectedRowCount({ result }), rows: [] };
    }

    const rows = returning ? await query.returning(returning as AnyType) : await query.returning();
    return { count: rows.length, rows: rows as Array<R> };
  }

  async remove<R>(opts: IRemoveOptions<TSqliteConnector>): Promise<IWriteResult<R>> {
    const { connector, table, where, returning, shouldReturn } = opts;
    const query = connector.delete(this.asTable({ table })).where(where);

    if (!shouldReturn) {
      const result = await query;
      return { count: this.readAffectedRowCount({ result }), rows: [] };
    }

    const rows = returning ? await query.returning(returning as AnyType) : await query.returning();
    return { count: rows.length, rows: rows as Array<R> };
  }

  /**
   * The neutral options carry the dialect-free `Table` bound; every Drizzle SQLite verb wants the
   * concrete `SQLiteTable`. Knowing your own input belongs in the engine adapter, so the whole
   * boundary is this one cast.
   */
  private asTable(opts: { table: TTableSchemaWithId }): SQLiteTable {
    return opts.table as SQLiteTable;
  }

  /**
   * Gets the Drizzle relational-query interface, validating schema registration. The error wording
   * names the entity and lists the available keys, and a test asserts it word for word.
   */
  private getQueryInterface(opts: IRelationalQueryOptions<TSqliteConnector>) {
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
   * Rows affected by a write with no RETURNING. Reads libsql's `ResultSet.rowsAffected`
   * off the raw result - engine knowledge the shared repository tier must not hold.
   * Drivers reporting `changes` instead are synchronous, and `TSqliteConnector` is
   * pinned to `'async'`, so none can arrive here.
   */
  private readAffectedRowCount(opts: { result: unknown }): number {
    const { result } = opts;

    // A driver whose Drizzle run-result resolves to nothing carries no count to read.
    if (result === null || result === undefined) {
      return 0;
    }

    if (typeof result !== 'object') {
      throw getError({
        message: `[readAffectedRowCount] Unrecognized driver result | expected a libsql ResultSet | got: ${typeof result}`,
      });
    }

    const { rowsAffected } = result as { rowsAffected?: unknown };

    if (typeof rowsAffected !== 'number') {
      throw getError({
        message: `[readAffectedRowCount] Unrecognized driver result | expected 'rowsAffected' (libsql) | got keys: ${Object.keys(result).join(', ')}`,
      });
    }

    return rowsAffected;
  }
}
