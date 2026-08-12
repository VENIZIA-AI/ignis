import { SqliteQueryExecutor } from '@/connectors/sqlite/repositories/executor';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `TSqliteConnector` is pinned to an ASYNC `BaseSQLiteDatabase`. better-sqlite3, `bun:sqlite` and
 * `node:sqlite` - the drivers that report `changes` or resolve to nothing - are all synchronous, so
 * no such result can reach the executor. These tests pin that the affected-row read says so.
 */
const rows = sqliteTable('driver_result_fixture', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name'),
});

const executor = new SqliteQueryExecutor();

const insertWithResult = (result: unknown) =>
  executor.insert({
    connector: { insert: () => ({ values: () => Promise.resolve(result) }) } as AnyType,
    table: rows,
    values: [{ name: 'a' }],
    shouldReturn: false,
  });

/** Empty when the insert resolved, which reads as a failed assertion rather than a passing one. */
const captureFailureMessage = (result: unknown): Promise<string> =>
  insertWithResult(result).then(
    () => '',
    (error: Error) => error.message,
  );

describe('SqliteQueryExecutor - affected-row count reads libsql and nothing else', () => {
  test("libsql's rowsAffected is read", async () => {
    expect(await insertWithResult({ rowsAffected: 3 })).toEqual({ count: 3, rows: [] });
  });

  test("a result carrying only 'changes' is refused, not counted", async () => {
    expect(await captureFailureMessage({ changes: 3 })).toContain('Unrecognized driver result');
  });

  test('the refusal names libsql only - no synchronous driver can reach this tier', async () => {
    const message = await captureFailureMessage({ changes: 3 });

    expect(message).toContain(`expected 'rowsAffected' (libsql)`);
    expect(message).not.toContain('better-sqlite3');
  });
});
