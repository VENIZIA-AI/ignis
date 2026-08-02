import { describe, expect, test } from 'bun:test';
import { IsolationLevels } from '@/connectors/postgres/datasources';

describe('BEGIN statement is engine-supplied', () => {
  test('postgres defaults to READ COMMITTED', async () => {
    const { PostgresDataSourceFixture } = await import('./fixtures/postgres-datasource.fixture.js');
    const dataSource = new PostgresDataSourceFixture();
    expect(dataSource.exposeBeginStatement()).toBe(
      'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED',
    );
  });

  test('postgres honours an explicit isolation level', async () => {
    const { PostgresDataSourceFixture } = await import('./fixtures/postgres-datasource.fixture.js');
    const dataSource = new PostgresDataSourceFixture();
    expect(dataSource.exposeBeginStatement({ isolationLevel: IsolationLevels.SERIALIZABLE })).toBe(
      'BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE',
    );
  });

  test('an engine with no isolation levels can emit its own statement', async () => {
    const { SqliteShapedFixture } = await import('./fixtures/sqlite-shaped-datasource.fixture.js');
    expect(new SqliteShapedFixture().exposeBeginStatement()).toBe('BEGIN IMMEDIATE');
  });
});
