import { IsolationLevels } from '@/relational/postgres/datasources';
import { SqliteBeginModes } from '@/relational/sqlite/datasources';
import { PGlite } from '@electric-sql/pglite';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import { getError } from '@venizia/ignis-helpers/core';
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import {
  POSTGRES_TABLE_DDL,
  PostgresTransactionEntity,
  PostgresTransactionRepository,
  SQLITE_TABLE_DDL,
  SqliteTransactionEntity,
  SqliteTransactionRepository,
  TransactionPostgresDataSource,
  TransactionSqliteDataSource,
} from './engine-fixtures';
import { TransactionEndStatements, captureRejection } from './parity-suite';

/** `runInTransaction` over a real connection on each in-process engine: rows really land or not. */

let pgliteClient: PGlite;
let libsqlClient: Client;
let postgresDataSource: TransactionPostgresDataSource;
let sqliteDataSource: TransactionSqliteDataSource;
let postgresRepository: PostgresTransactionRepository;
let sqliteRepository: SqliteTransactionRepository;

beforeAll(async () => {
  pgliteClient = new PGlite();
  await pgliteClient.waitReady;
  await pgliteClient.exec(POSTGRES_TABLE_DDL);

  postgresDataSource = new TransactionPostgresDataSource({ client: pgliteClient });
  postgresDataSource.configure();
  postgresRepository = new PostgresTransactionRepository(postgresDataSource, {
    entityClass: PostgresTransactionEntity,
  });

  libsqlClient = createClient({ url: ':memory:' });
  await libsqlClient.execute(SQLITE_TABLE_DDL);

  sqliteDataSource = new TransactionSqliteDataSource({ client: libsqlClient });
  sqliteDataSource.configure();
  sqliteRepository = new SqliteTransactionRepository(sqliteDataSource, {
    entityClass: SqliteTransactionEntity,
  });
});

afterAll(async () => {
  await postgresDataSource.endDriver();
  libsqlClient.close();
});

describe('runInTransaction runtime - postgres (PGlite)', () => {
  const countNamed = async (opts: { name: string }) =>
    (await postgresRepository.count({ where: { name: opts.name } })).count;

  test('owned: a resolved execute really commits - the row is visible afterwards', async () => {
    postgresDataSource.recorder.reset();

    const created = await postgresRepository.runInTransaction({
      execute: ({ transaction }) =>
        postgresRepository.create({ data: { name: 'owned-commit' }, options: { transaction } }),
    });

    expect(created.count).toBe(1);
    expect(await countNamed({ name: 'owned-commit' })).toBe(1);
    expect(postgresDataSource.recorder.statements).toContain(TransactionEndStatements.COMMIT);
    expect(postgresDataSource.recorder.statements).not.toContain(TransactionEndStatements.ROLLBACK);
  });

  test('owned: a throwing execute really rolls back - the row is not visible, the error is the original', async () => {
    postgresDataSource.recorder.reset();
    const original = getError({ message: '[RunInTransactionRuntime] execute failed' });

    const caught = await captureRejection({
      task: postgresRepository.runInTransaction({
        execute: async ({ transaction }) => {
          await postgresRepository.create({
            data: { name: 'owned-rollback' },
            options: { transaction },
          });
          throw original;
        },
      }),
    });

    expect(caught).toBe(original);
    expect(await countNamed({ name: 'owned-rollback' })).toBe(0);
    expect(postgresDataSource.recorder.statements).toContain(TransactionEndStatements.ROLLBACK);
    expect(postgresDataSource.recorder.statements).not.toContain(TransactionEndStatements.COMMIT);
  });

  test('owned: transactionOptions reach the real BEGIN', async () => {
    postgresDataSource.recorder.reset();

    await postgresRepository.runInTransaction({
      transactionOptions: { isolationLevel: IsolationLevels.SERIALIZABLE },
      execute: async () => undefined,
    });

    expect(postgresDataSource.recorder.statements[0]).toBe(
      'BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE',
    );
  });

  test('joined: the caller keeps ownership - nothing commits until the caller does', async () => {
    const transaction = await postgresDataSource.beginTransaction();
    postgresDataSource.recorder.reset();

    // The single engine session stays borrowed until this transaction ends, so it always ends here.
    try {
      await postgresRepository.runInTransaction({
        transaction,
        execute: ({ transaction: joined }) =>
          postgresRepository.create({
            data: { name: 'joined-rollback' },
            options: { transaction: joined },
          }),
      });

      expect(transaction.isActive).toBe(true);
      expect(postgresDataSource.recorder.statements).toEqual([]);
    } finally {
      if (transaction.isActive) {
        await transaction.rollback();
      }
    }

    expect(await countNamed({ name: 'joined-rollback' })).toBe(0);
  });

  test('joined: an ended handle throws before execute runs', async () => {
    const transaction = await postgresDataSource.beginTransaction();
    await transaction.commit();
    const execute = mock(async () => 'never-called');

    const caught = await captureRejection({
      task: postgresRepository.runInTransaction({ transaction, execute }),
    });

    expect(caught).toBeDefined();
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('runInTransaction runtime - sqlite (libsql :memory:)', () => {
  const countNamed = async (opts: { name: string }) =>
    (await sqliteRepository.count({ where: { name: opts.name } })).count;

  test('owned: a resolved execute really commits - the row is visible afterwards', async () => {
    sqliteDataSource.recorder.reset();

    const created = await sqliteRepository.runInTransaction({
      execute: ({ transaction }) =>
        sqliteRepository.create({ data: { name: 'owned-commit' }, options: { transaction } }),
    });

    expect(created.count).toBe(1);
    expect(await countNamed({ name: 'owned-commit' })).toBe(1);
    expect(sqliteDataSource.recorder.statements).toContain(TransactionEndStatements.COMMIT);
    expect(sqliteDataSource.recorder.statements).not.toContain(TransactionEndStatements.ROLLBACK);
  });

  test('owned: a throwing execute really rolls back - the row is not visible, the error is the original', async () => {
    sqliteDataSource.recorder.reset();
    const original = getError({ message: '[RunInTransactionRuntime] execute failed' });

    const caught = await captureRejection({
      task: sqliteRepository.runInTransaction({
        execute: async ({ transaction }) => {
          await sqliteRepository.create({
            data: { name: 'owned-rollback' },
            options: { transaction },
          });
          throw original;
        },
      }),
    });

    expect(caught).toBe(original);
    expect(await countNamed({ name: 'owned-rollback' })).toBe(0);
    expect(sqliteDataSource.recorder.statements).toContain(TransactionEndStatements.ROLLBACK);
    expect(sqliteDataSource.recorder.statements).not.toContain(TransactionEndStatements.COMMIT);
  });

  test('owned: transactionOptions reach the real BEGIN', async () => {
    sqliteDataSource.recorder.reset();

    await sqliteRepository.runInTransaction({
      transactionOptions: { beginMode: SqliteBeginModes.DEFERRED },
      execute: async () => undefined,
    });

    expect(sqliteDataSource.recorder.statements[0]).toBe('BEGIN DEFERRED');
  });

  test('joined: the caller keeps ownership - nothing commits until the caller does', async () => {
    const transaction = await sqliteDataSource.beginTransaction();
    sqliteDataSource.recorder.reset();

    // The single engine session stays borrowed until this transaction ends, so it always ends here.
    try {
      await sqliteRepository.runInTransaction({
        transaction,
        execute: ({ transaction: joined }) =>
          sqliteRepository.create({
            data: { name: 'joined-rollback' },
            options: { transaction: joined },
          }),
      });

      expect(transaction.isActive).toBe(true);
      expect(sqliteDataSource.recorder.statements).toEqual([]);
    } finally {
      if (transaction.isActive) {
        await transaction.rollback();
      }
    }

    expect(await countNamed({ name: 'joined-rollback' })).toBe(0);
  });

  test('joined: an ended handle throws before execute runs', async () => {
    const transaction = await sqliteDataSource.beginTransaction();
    await transaction.commit();
    const execute = mock(async () => 'never-called');

    const caught = await captureRejection({
      task: sqliteRepository.runInTransaction({ transaction, execute }),
    });

    expect(caught).toBeDefined();
    expect(execute).not.toHaveBeenCalled();
  });
});
