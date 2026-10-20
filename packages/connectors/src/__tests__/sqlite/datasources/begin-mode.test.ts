import type { TSqliteBeginMode } from '@/relational/sqlite/datasources';
import { SqliteBeginModes } from '@/relational/sqlite/datasources';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { afterEach, describe, expect, test } from 'bun:test';
import { SqliteDataSourceFixture } from './fixtures/sqlite-datasource.fixture';

describe('BaseSqliteDataSource - beginMode validation', () => {
  test('defaults to IMMEDIATE', () => {
    expect(new SqliteDataSourceFixture().exposeBeginStatement()).toBe('BEGIN IMMEDIATE');
  });

  test('accepts every mode SqliteBeginModes declares', () => {
    const dataSource = new SqliteDataSourceFixture();

    const modes: Array<TSqliteBeginMode> = [
      SqliteBeginModes.DEFERRED,
      SqliteBeginModes.IMMEDIATE,
      SqliteBeginModes.EXCLUSIVE,
    ];

    const statements = modes.map(beginMode => dataSource.exposeBeginStatement({ beginMode }));

    expect(statements).toEqual(['BEGIN DEFERRED', 'BEGIN IMMEDIATE', 'BEGIN EXCLUSIVE']);
  });

  test('refuses an unknown mode before it becomes SQL', () => {
    const dataSource = new SqliteDataSourceFixture();

    expect(() => dataSource.exposeBeginStatement({ beginMode: 'CONCURRENT' as AnyType })).toThrow(
      /beginMode.+CONCURRENT/,
    );
  });

  test('refuses a mode carrying injected SQL - the driver runs this statement verbatim', () => {
    const dataSource = new SqliteDataSourceFixture();
    const injected = 'IMMEDIATE; DROP TABLE users; --';

    expect(() => dataSource.exposeBeginStatement({ beginMode: injected as AnyType })).toThrow(
      /beginMode/,
    );
  });

  test('refuses lower-case: the mode is interpolated as written, never normalised', () => {
    const dataSource = new SqliteDataSourceFixture();

    expect(() => dataSource.exposeBeginStatement({ beginMode: 'immediate' as AnyType })).toThrow(
      /beginMode/,
    );
  });
});

describe('BaseSqliteDataSource - beginTransaction', () => {
  let dataSource: SqliteDataSourceFixture | undefined;

  afterEach(() => {
    dataSource?.getClient().close();
    dataSource = undefined;
  });

  test('resolves the mode once and hands the settled mode down to buildBeginStatement()', async () => {
    dataSource = new SqliteDataSourceFixture();
    dataSource.configure();

    const transaction = await dataSource.beginTransaction();
    await transaction.rollback();

    expect(dataSource.beginStatementCalls).toHaveLength(1);
    expect(dataSource.beginStatementCalls[0]?.beginMode).toBe(SqliteBeginModes.IMMEDIATE);
    expect(transaction.beginMode).toBe(SqliteBeginModes.IMMEDIATE);
  });

  test('carries an explicit mode through to both the statement and the handle', async () => {
    dataSource = new SqliteDataSourceFixture();
    dataSource.configure();

    const transaction = await dataSource.beginTransaction({
      beginMode: SqliteBeginModes.DEFERRED,
    });
    await transaction.rollback();

    expect(dataSource.beginStatementCalls[0]?.beginMode).toBe(SqliteBeginModes.DEFERRED);
    expect(transaction.beginMode).toBe(SqliteBeginModes.DEFERRED);
  });

  test('refuses an unknown mode without ever reaching the driver', async () => {
    dataSource = new SqliteDataSourceFixture();
    dataSource.configure();

    let failure: unknown;
    try {
      await dataSource.beginTransaction({ beginMode: 'CONCURRENT' as AnyType });
    } catch (error) {
      failure = error;
    }

    expect((failure as Error)?.message).toMatch(/beginMode.+CONCURRENT/);
    expect(dataSource.beginStatementCalls).toHaveLength(0);
  });
});
