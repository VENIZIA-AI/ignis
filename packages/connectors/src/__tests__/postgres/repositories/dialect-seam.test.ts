import { describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { jsonb, PgDialect, pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { AnyType } from '@venizia/ignis-helpers/common';
import type { TQueryOperatorHandlers } from '@venizia/ignis-kernel';
import type { TTableColumns } from '@/relational/core/repositories/common';
import { PostgresFilterBuilder } from '@/relational/postgres/repositories/dialect/filter';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { FilterBuilder } from '@/relational/core/repositories/dialect';

/**
 * A second SQL engine reuses `FilterBuilder` by supplying an operator table and a JSON-path variant
 * of a handful of methods. That only holds while those methods stay overridable AND the base stays
 * reachable without importing the Postgres branch. If any of the six seam methods goes back to
 * `private`, or the operator table goes back to a hardcoded `PostgresQueryOperators.FNS` on the
 * base, this file stops compiling.
 */

const accounts = pgTable('dialect_seam_accounts', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }),
  metadata: jsonb('meta_data'),
});

const pgDialect = new PgDialect();
const compile = (expression: SQL | undefined): string =>
  expression ? pgDialect.sqlToQuery(expression).sql : '';

/**
 * A second engine's dialect: its own operator table plus SQLite's `json_extract` path syntax in
 * place of Postgres's `#>>`/`#>`. Everything else is inherited, including the operator walk.
 */
class SqliteShapedDialect extends FilterBuilder {
  protected override get operators(): TQueryOperatorHandlers {
    return {
      eq: opts => sql`${opts.column} IS ${opts.value}`,
      like: opts => sql`${opts.column} GLOB ${opts.value}`,
    };
  }

  protected override buildJsonWhereCondition(opts: {
    key: string;
    value: AnyType;
    columns: TTableColumns;
    tableName: string;
  }): SQL[] {
    const { column, path } = this.validateJsonColumn({
      key: opts.key,
      columns: opts.columns,
      tableName: opts.tableName,
      methodName: 'buildJsonWhereCondition',
    });

    const extraction = `json_extract("${column.name}", '$.${path.join('.')}')`;
    // Reached through the base's own walk, so the numeric-cast decision stays inherited.
    const needsNumericCast = this.jsonNeedsNumericCast({ operators: opts.value });

    return this.buildJsonOperatorConditions({
      jsonPath: extraction,
      safeNumericCast: needsNumericCast ? `CAST(${extraction} AS REAL)` : extraction,
      operators: opts.value,
    });
  }

  protected override buildJsonOrderBy(opts: {
    key: string;
    direction: AnyType;
    columns: TTableColumns;
    tableName: string;
  }): SQL {
    const { column, path } = this.validateJsonColumn({
      key: opts.key,
      columns: opts.columns,
      tableName: opts.tableName,
      methodName: 'buildJsonOrderBy',
    });

    return sql.raw(
      `json_extract("${column.name}", '$.${path.join('.')}') ${opts.direction.toUpperCase()}`,
    );
  }
}

const postgresBuilder = new PostgresFilterBuilder();
const sqliteBuilder = new SqliteShapedDialect();

const toWhere = (builder: FilterBuilder, where: AnyType) =>
  compile(builder.toWhere({ tableName: 'dialect_seam_accounts', schema: accounts, where }));

const toOrderBy = (builder: FilterBuilder, order: string[]) =>
  builder
    .toOrderBy({ tableName: 'dialect_seam_accounts', schema: accounts, order })
    .map(entry => compile(entry));

describe('FilterBuilder - the operator table is an override seam', () => {
  test('a subclass supplying its own table changes the emitted operator SQL', () => {
    expect(toWhere(postgresBuilder, { email: { eq: 'a@b.c' } })).toContain('=');
    expect(toWhere(sqliteBuilder, { email: { eq: 'a@b.c' } })).toContain('IS');
  });

  test('an operator absent from the subclass table is rejected, not silently translated', () => {
    expect(() => toWhere(sqliteBuilder, { email: { ilike: '%a%' } })).toThrow(
      "[FilterBuilder][buildOperatorConditions] Invalid query operator | operator: 'ilike'",
    );
  });

  test('the inherited walk still runs: logical groups and bare values need no override', () => {
    const emitted = toWhere(sqliteBuilder, { or: [{ email: { eq: 'a' } }, { id: 1 }] });

    expect(emitted).toContain(' or ');
    expect(emitted).toContain('IS');
  });
});

describe('FilterBuilder - the JSON-path methods are an override seam', () => {
  test('a subclass emits its own path syntax where Postgres emits #>>', () => {
    expect(toWhere(postgresBuilder, { 'metadata.tier': { eq: 'gold' } })).toContain('#>>');

    const emitted = toWhere(sqliteBuilder, { 'metadata.tier': { eq: 'gold' } });
    expect(emitted).toContain(`json_extract("meta_data", '$.tier')`);
    expect(emitted).not.toContain('#>>');
  });

  test('order-by JSON paths swap the same way', () => {
    expect(toOrderBy(postgresBuilder, ['metadata.tier DESC'])[0]).toContain('#>');

    const emitted = toOrderBy(sqliteBuilder, ['metadata.tier DESC'])[0];
    expect(emitted).toBe(`json_extract("meta_data", '$.tier') DESC`);
    expect(emitted).not.toContain('#>');
  });
});

describe('the shipped Postgres dialect is unaffected by the seam', () => {
  test('PostgresQueryDialect emits exactly what FilterBuilder does', () => {
    const dialect = new PostgresQueryDialect();
    const where = { email: { eq: 'a@b.c' }, 'metadata.tier': { eq: 'gold' } };

    expect(toWhere(dialect, where)).toBe(toWhere(postgresBuilder, where));
    expect(toOrderBy(dialect, ['metadata.tier DESC'])).toEqual(
      toOrderBy(postgresBuilder, ['metadata.tier DESC']),
    );
  });
});
