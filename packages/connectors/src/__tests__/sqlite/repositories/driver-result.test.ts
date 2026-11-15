import { SqliteQueryExecutor } from '@/relational/sqlite/repositories/executor';
import { DuckTypingUtility } from '@/common/internal';
import type { TSqliteConnector } from '@/relational/sqlite/drivers';
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

/** The one verb the fake connector carries, stated as a guard so it can be handed over as a connector. */
const isInsertConnector = (value: unknown): value is TSqliteConnector =>
  DuckTypingUtility.hasMembers({ value, members: { insert: 'function' } });

const insertWithResult = (result: unknown) => {
  const connector = { insert: () => ({ values: () => Promise.resolve(result) }) };

  if (!isInsertConnector(connector)) {
    throw new Error('[insertWithResult] The fake lacks insert()');
  }

  return executor.insert({
    connector,
    table: rows,
    values: [{ name: 'a' }],
    shouldReturn: false,
  });
};

/** Empty when the insert resolved, which reads as a failed assertion rather than a passing one. */
const captureFailureMessage = (result: unknown): Promise<string> =>
  insertWithResult(result).then(
    () => '',
    (error: Error) => error.message,
  );

describe('SqliteQueryExecutor - affected-row count reads libsql and nothing else', () => {
  test("libsql's rowsAffected is read", async () => {
    const result = await insertWithResult({ rowsAffected: 3 });
    expect(result).toEqual({ count: 3, rows: [] });
  });

  test("a result carrying only 'changes' is refused, not counted", async () => {
    const result2 = await captureFailureMessage({ changes: 3 });
    expect(result2).toContain('Unrecognized driver result');
  });

  test('the refusal names libsql only - no synchronous driver can reach this tier', async () => {
    const message = await captureFailureMessage({ changes: 3 });

    expect(message).toContain(`expected 'rowsAffected' (libsql)`);
    expect(message).not.toContain('better-sqlite3');
  });
});
