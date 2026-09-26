import type { ITransaction } from '@venizia/ignis-kernel';
import type { IRelationalExtraOptions } from '@/relational/core/repositories';
import { IsolationLevels } from '@/relational/postgres/datasources';
import type { IDatabaseExtraOptions } from '@/relational/postgres/repositories';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import { SqliteBeginModes } from '@/relational/sqlite/datasources';
import type { ISqliteExtraOptions } from '@/relational/sqlite/repositories';
import { DefaultSqliteRepository } from '@/relational/sqlite/repositories';
import {
  PostgresTransactionDouble,
  SqliteTransactionDouble,
  TransactionDouble,
  TransactionStates,
} from '@/testing';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import { getError, isApplicationError } from '@venizia/ignis-helpers/core';
import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import {
  PostgresTransactionRepository,
  SQLITE_TABLE_DDL,
  SqliteTransactionEntity,
  SqliteTransactionRepository,
  TransactionSqliteDataSource,
  postgresItemTable,
  sqliteItemTable,
} from './engine-fixtures';
import { captureRejection } from './parity-suite';

const CONNECTOR_UNAVAILABLE =
  '[TransactionDouble] connector is not available - stub the repository method that reached the database';

describe('TransactionStates', () => {
  test('names the four states, each distinct', () => {
    const states = [
      TransactionStates.ACTIVE,
      TransactionStates.COMMITTED,
      TransactionStates.ROLLED_BACK,
      TransactionStates.FAILED,
    ];

    expect(new Set(states).size).toBe(4);
    expect([...TransactionStates.SCHEME_SET].sort()).toEqual([...states].sort());
  });

  test('isValid() accepts every state and refuses anything else', () => {
    for (const state of TransactionStates.SCHEME_SET) {
      expect(TransactionStates.isValid(state)).toBe(true);
    }

    expect(TransactionStates.isValid('unknown-state')).toBe(false);
  });
});

describe('TransactionDouble', () => {
  test('starts active, in ACTIVE, with both counts at zero', () => {
    const double = new TransactionDouble();

    expect(double.isActive).toBe(true);
    expect(double.state).toBe(TransactionStates.ACTIVE);
    expect(double.commitCount).toBe(0);
    expect(double.rollbackCount).toBe(0);
  });

  test('commit() moves it to COMMITTED and counts one commit', async () => {
    const double = new TransactionDouble();

    await double.commit();

    expect(double.state).toBe(TransactionStates.COMMITTED);
    expect(double.isActive).toBe(false);
    expect(double.commitCount).toBe(1);
    expect(double.rollbackCount).toBe(0);
  });

  test('rollback() moves it to ROLLED_BACK and counts one rollback', async () => {
    const double = new TransactionDouble();

    await double.rollback();

    expect(double.state).toBe(TransactionStates.ROLLED_BACK);
    expect(double.isActive).toBe(false);
    expect(double.commitCount).toBe(0);
    expect(double.rollbackCount).toBe(1);
  });

  test('an injected commitError is thrown as-is and ends the transaction in FAILED', async () => {
    const commitError = getError({ message: '[TransactionDoubleTest] commit refused' });
    const double = new TransactionDouble({ commitError });

    expect(await captureRejection({ task: double.commit() })).toBe(commitError);
    expect(double.state).toBe(TransactionStates.FAILED);
    expect(double.isActive).toBe(false);
    expect(double.commitCount).toBe(1);
  });

  test('an injected rollbackError is thrown as-is, ends in FAILED, and a second rollback is a no-op', async () => {
    const rollbackError = getError({ message: '[TransactionDoubleTest] rollback refused' });
    const double = new TransactionDouble({ rollbackError });

    expect(await captureRejection({ task: double.rollback() })).toBe(rollbackError);
    expect(double.state).toBe(TransactionStates.FAILED);

    await double.rollback();

    expect(double.state).toBe(TransactionStates.FAILED);
    expect(double.rollbackCount).toBe(1);
  });

  test('state stays COMMITTED when an ended transaction is ended again', async () => {
    const double = new TransactionDouble();
    await double.commit();

    await captureRejection({ task: double.rollback() });

    expect(double.state).toBe(TransactionStates.COMMITTED);
  });

  test('reading connector throws an application error that names the fix', () => {
    const double = new TransactionDouble();
    const readConnector = (): unknown => double.connector;

    let caught: unknown;
    try {
      readConnector();
    } catch (error) {
      caught = error;
    }

    expect(isApplicationError(caught)).toBe(true);
    expect(caught).toMatchObject({ message: CONNECTOR_UNAVAILABLE });
  });

  test('it is a relational transaction: `connector` is a member, so repositories reach for it', () => {
    expect('connector' in new TransactionDouble()).toBe(true);
  });
});

describe('Engine doubles', () => {
  test('PostgresTransactionDouble defaults isolationLevel to READ COMMITTED, like the real BEGIN', () => {
    const double = new PostgresTransactionDouble();

    expect(double.isolationLevel).toBe(IsolationLevels.READ_COMMITTED);
    expect(double).toBeInstanceOf(TransactionDouble);
  });

  test('PostgresTransactionDouble carries the isolationLevel it was given', () => {
    const double = new PostgresTransactionDouble({ isolationLevel: IsolationLevels.SERIALIZABLE });

    expect(double.isolationLevel).toBe(IsolationLevels.SERIALIZABLE);
  });

  test('SqliteTransactionDouble defaults beginMode to IMMEDIATE, like the real BEGIN', () => {
    const double = new SqliteTransactionDouble();

    expect(double.beginMode).toBe(SqliteBeginModes.IMMEDIATE);
    expect(double).toBeInstanceOf(TransactionDouble);
  });

  test('SqliteTransactionDouble carries the beginMode it was given', () => {
    const double = new SqliteTransactionDouble({ beginMode: SqliteBeginModes.EXCLUSIVE });

    expect(double.beginMode).toBe(SqliteBeginModes.EXCLUSIVE);
  });

  test('engine doubles still take the injected errors', async () => {
    const commitError = getError({ message: '[TransactionDoubleTest] commit refused' });
    const double = new PostgresTransactionDouble({ commitError });

    expect(await captureRejection({ task: double.commit() })).toBe(commitError);
    expect(double.state).toBe(TransactionStates.FAILED);
  });
});

/**
 * Compile-time contract: every statement below type-checks with no cast. `tsc --noEmit -p
 * tsconfig.json` in this package is the real check; the runtime assertions only prove the stubs
 * were wired.
 */
describe('Cast-free use in a repository test', () => {
  test('spyOn(repository, beginTransaction).mockResolvedValue(double) on a default Postgres repository', async () => {
    const repository = new DefaultCRUDRepository<typeof postgresItemTable>();
    const double = new PostgresTransactionDouble();

    const beginSpy = spyOn(repository, 'beginTransaction').mockResolvedValue(double);

    expect(await repository.beginTransaction()).toBe(double);
    expect(beginSpy).toHaveBeenCalledTimes(1);
  });

  test('spyOn(...).mockResolvedValue(double) on a repository bound to its own datasource type', async () => {
    const repository = new PostgresTransactionRepository();
    const double = new PostgresTransactionDouble();

    spyOn(repository, 'beginTransaction').mockResolvedValue(double);

    expect(await repository.beginTransaction()).toBe(double);
  });

  test('spyOn(...).mockResolvedValue(double) on SQLite repositories', async () => {
    const neutral = new DefaultSqliteRepository<typeof sqliteItemTable>();
    const bound = new SqliteTransactionRepository();
    const double = new SqliteTransactionDouble();

    spyOn(neutral, 'beginTransaction').mockResolvedValue(double);
    spyOn(bound, 'beginTransaction').mockResolvedValue(double);

    expect(await neutral.beginTransaction()).toBe(double);
    expect(await bound.beginTransaction()).toBe(double);
  });

  test('options: { transaction: double } fits every tier of extra options', () => {
    const neutralDouble = new TransactionDouble();
    const postgresDouble = new PostgresTransactionDouble();
    const sqliteDouble = new SqliteTransactionDouble();

    const kernelOptions: { transaction?: ITransaction } = { transaction: neutralDouble };
    const relationalOptions: IRelationalExtraOptions = { transaction: neutralDouble };
    const postgresOptions: IDatabaseExtraOptions = { transaction: postgresDouble };
    const sqliteOptions: ISqliteExtraOptions = { transaction: sqliteDouble };

    expect(kernelOptions.transaction).toBe(neutralDouble);
    expect(relationalOptions.transaction).toBe(neutralDouble);
    expect(postgresOptions.transaction).toBe(postgresDouble);
    expect(sqliteOptions.transaction).toBe(sqliteDouble);
  });
});

/** An unstubbed repository method that reaches for the double's connector fails loudly. */
describe('A double handed to a real repository', () => {
  let client: Client;
  let repository: SqliteTransactionRepository;

  beforeAll(async () => {
    client = createClient({ url: ':memory:' });
    await client.execute(SQLITE_TABLE_DDL);

    const dataSource = new TransactionSqliteDataSource({ client });
    dataSource.configure();

    repository = new SqliteTransactionRepository(dataSource, {
      entityClass: SqliteTransactionEntity,
    });
  });

  afterAll(() => {
    client.close();
  });

  test('options: { transaction: double } on a read throws the connector message', async () => {
    const caught = await captureRejection({
      task: repository.count({
        where: {},
        options: { transaction: new SqliteTransactionDouble() },
      }),
    });

    expect(caught).toMatchObject({ message: CONNECTOR_UNAVAILABLE });
  });

  test('options: { transaction: double } on a write throws the connector message', async () => {
    const caught = await captureRejection({
      task: repository.create({
        data: { name: 'unreachable' },
        options: { transaction: new SqliteTransactionDouble() },
      }),
    });

    expect(caught).toMatchObject({ message: CONNECTOR_UNAVAILABLE });
  });
});

/**
 * How runInTransaction reads a handle's state is internal: the /testing classes publish no
 * `getState`, as a static or on an instance.
 */
describe('The testing classes carry no state-reading API', () => {
  test('no getState on TransactionDouble or the engine doubles, static or instance', () => {
    const subjects = [
      { name: 'TransactionDouble', target: TransactionDouble, instance: new TransactionDouble() },
      {
        name: 'PostgresTransactionDouble',
        target: PostgresTransactionDouble,
        instance: new PostgresTransactionDouble(),
      },
      {
        name: 'SqliteTransactionDouble',
        target: SqliteTransactionDouble,
        instance: new SqliteTransactionDouble(),
      },
    ];

    for (const { name, target, instance } of subjects) {
      expect({
        name,
        isStatic: 'getState' in target,
        isOnInstance: 'getState' in instance,
      }).toEqual({
        name,
        isStatic: false,
        isOnInstance: false,
      });
    }
  });
});
