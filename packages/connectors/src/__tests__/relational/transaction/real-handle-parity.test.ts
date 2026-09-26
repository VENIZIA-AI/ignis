import { PGlite } from '@electric-sql/pglite';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import { getError } from '@venizia/ignis-helpers/core';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  POSTGRES_TABLE_DDL,
  SQLITE_TABLE_DDL,
  TransactionPostgresDataSource,
  TransactionSqliteDataSource,
  buildRealHandleProbe,
} from './engine-fixtures';
import { TransactionEndStatements, captureRejection, runTransactionParity } from './parity-suite';
import { RecordingLogger } from './recording-logger';

/**
 * The real handle's end-of-transaction rules, pinned on both in-process engines. Green before the
 * state machine is extracted and required to stay green after: this file is the regression net.
 */

let pgliteClient: PGlite;
let libsqlClient: Client;
let postgresDataSource: TransactionPostgresDataSource;
let sqliteDataSource: TransactionSqliteDataSource;

beforeAll(async () => {
  pgliteClient = new PGlite();
  await pgliteClient.waitReady;
  await pgliteClient.exec(POSTGRES_TABLE_DDL);

  postgresDataSource = new TransactionPostgresDataSource({ client: pgliteClient });
  postgresDataSource.configure();

  libsqlClient = createClient({ url: ':memory:' });
  await libsqlClient.execute(SQLITE_TABLE_DDL);

  sqliteDataSource = new TransactionSqliteDataSource({ client: libsqlClient });
  sqliteDataSource.configure();
});

afterAll(async () => {
  await postgresDataSource.endDriver();
  libsqlClient.close();
});

runTransactionParity({
  subject: 'real handle, postgres (PGlite)',
  probe: () => buildRealHandleProbe({ dataSource: postgresDataSource }),
});

runTransactionParity({
  subject: 'real handle, sqlite (libsql :memory:)',
  probe: () => buildRealHandleProbe({ dataSource: sqliteDataSource }),
});

/** Connection-level rules only a real handle has: which statement ran, and how it was released. */
const ENGINES = [
  {
    engine: 'postgres (PGlite)',
    begin: 'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED',
    dataSource: () => postgresDataSource,
  },
  {
    engine: 'sqlite (libsql :memory:)',
    begin: 'BEGIN IMMEDIATE',
    dataSource: () => sqliteDataSource,
  },
];

for (const { engine, begin, dataSource } of ENGINES) {
  describe(`Real handle connection release - ${engine}`, () => {
    test('a successful commit runs BEGIN then COMMIT and pools the connection once', async () => {
      const recorder = dataSource().recorder;
      recorder.reset();

      const transaction = await dataSource().beginTransaction();
      await transaction.commit();

      expect(recorder.statements).toEqual([begin, TransactionEndStatements.COMMIT]);
      expect(recorder.releases).toEqual([{ isDestroyed: false }]);
    });

    test('a successful rollback runs BEGIN then ROLLBACK and pools the connection once', async () => {
      const recorder = dataSource().recorder;
      recorder.reset();

      const transaction = await dataSource().beginTransaction();
      await transaction.rollback();

      expect(recorder.statements).toEqual([begin, TransactionEndStatements.ROLLBACK]);
      expect(recorder.releases).toEqual([{ isDestroyed: false }]);
    });

    test('a failed COMMIT destroys the connection, once, and a later rollback releases nothing', async () => {
      const recorder = dataSource().recorder;
      const error = getError({ message: '[TransactionParity] COMMIT injected to fail' });
      recorder.reset({ failure: { statement: TransactionEndStatements.COMMIT, error } });

      const transaction = await dataSource().beginTransaction();

      expect(await captureRejection({ task: transaction.commit() })).toBe(error);
      await transaction.rollback();

      expect(recorder.releases).toEqual([{ isDestroyed: true }]);
    });

    test('a failed ROLLBACK destroys the connection, once', async () => {
      const recorder = dataSource().recorder;
      const error = getError({ message: '[TransactionParity] ROLLBACK injected to fail' });
      recorder.reset({ failure: { statement: TransactionEndStatements.ROLLBACK, error } });

      const transaction = await dataSource().beginTransaction();

      expect(await captureRejection({ task: transaction.rollback() })).toBe(error);
      expect(recorder.releases).toEqual([{ isDestroyed: true }]);
    });

    test('concurrent commit() and rollback() release the connection once', async () => {
      const recorder = dataSource().recorder;
      recorder.reset();

      const transaction = await dataSource().beginTransaction();
      await Promise.allSettled([transaction.commit(), transaction.rollback()]);

      expect(recorder.releases).toEqual([{ isDestroyed: false }]);
    });
  });

  describe(`Real handle log lines - ${engine}`, () => {
    /** A fresh recorder per test, installed through the datasource's logger setter. */
    const installLogger = (): RecordingLogger => {
      const logger = new RecordingLogger();
      dataSource().logger = logger;
      return logger;
    };

    test('a failed COMMIT logs one error under commit, then the rollback no-op logs one debug under rollback', async () => {
      const logger = installLogger();
      const error = getError({ message: '[TransactionParity] COMMIT injected to fail' });
      dataSource().recorder.reset({
        failure: { statement: TransactionEndStatements.COMMIT, error },
      });

      const transaction = await dataSource().beginTransaction();
      await captureRejection({ task: transaction.commit() });
      await transaction.rollback();

      expect(logger.calls).toEqual([
        {
          level: 'error',
          method: 'commit',
          message: 'Failed to %s transaction | Error: %s',
          args: [TransactionEndStatements.COMMIT, error],
        },
        {
          level: 'debug',
          method: 'rollback',
          message: 'Rollback after a failure-ended transaction - no-op, already torn down',
          args: [],
        },
      ]);
    });

    test('a failed ROLLBACK logs one error under rollback', async () => {
      const logger = installLogger();
      const error = getError({ message: '[TransactionParity] ROLLBACK injected to fail' });
      dataSource().recorder.reset({
        failure: { statement: TransactionEndStatements.ROLLBACK, error },
      });

      const transaction = await dataSource().beginTransaction();
      await captureRejection({ task: transaction.rollback() });

      expect(logger.calls).toEqual([
        {
          level: 'error',
          method: 'rollback',
          message: 'Failed to %s transaction | Error: %s',
          args: [TransactionEndStatements.ROLLBACK, error],
        },
      ]);
    });

    test('a successful commit and a successful rollback log nothing', async () => {
      const logger = installLogger();
      dataSource().recorder.reset();

      const committed = await dataSource().beginTransaction();
      await committed.commit();
      const rolledBack = await dataSource().beginTransaction();
      await rolledBack.rollback();

      expect(logger.calls).toEqual([]);
    });
  });
}
