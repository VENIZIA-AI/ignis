import { describe, expect, test } from 'bun:test';
import { PostgresQueryDialect } from '@/connectors/postgres/repositories/dialect/query-dialect';
import { PostgresQueryExecutor } from '@/connectors/postgres/repositories/executor';
import { AbstractRelationalDataSource } from '@/connectors/relational/datasources';
import type { AnyType } from '@venizia/ignis-helpers/common';

describe('datasource supplies both ports', () => {
  test('the neutral base does not name a dialect or an executor', () => {
    const source = AbstractRelationalDataSource.prototype as AnyType;
    expect(source.getQueryDialect).toBeUndefined();
    expect(source.getQueryExecutor).toBeUndefined();
  });

  /**
   * Asserts the concrete `PostgresQueryDialect`, not its `PostgresFilterBuilder` base. The base has
   * no `transformUpdate` / `toUpdateData`, so a bare filter builder would satisfy a looser check
   * while every JSON-path update silently broke.
   */
  test('the postgres datasource supplies a PostgresQueryDialect and a PostgresQueryExecutor', async () => {
    const { PostgresDataSourceFixture } = await import('./fixtures/postgres-datasource.fixture.js');
    const dataSource = new PostgresDataSourceFixture();

    expect(dataSource.getQueryDialect()).toBeInstanceOf(PostgresQueryDialect);
    expect(dataSource.getQueryExecutor()).toBeInstanceOf(PostgresQueryExecutor);
  });

  test('both ports are memoized per class, not rebuilt per call', () => {
    const { PostgresDataSourceFixture } = require('./fixtures/postgres-datasource.fixture.js');
    const dataSource = new PostgresDataSourceFixture();
    expect(dataSource.getQueryDialect()).toBe(dataSource.getQueryDialect());
    expect(dataSource.getQueryExecutor()).toBe(dataSource.getQueryExecutor());
  });
});
