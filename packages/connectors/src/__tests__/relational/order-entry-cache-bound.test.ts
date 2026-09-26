import { isApplicationError } from '@venizia/ignis-helpers/core';
import { describe, expect, test } from 'bun:test';
import { jsonb, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';

/**
 * The dialect remembers parsed order entries, and one dialect instance serves every request of an
 * engine. An entry longer than a real order entry must not be remembered, or a caller can pin
 * about 1024 x its entry length of heap. The cache is private, so the bound is observed the only
 * way it shows from outside: heap retained by a live dialect after a full collection. The exact
 * bounds are read from the cache itself through `Reflect.get`, narrowed with `instanceof`.
 *
 * Own file, so no other suite's allocations run between the two heap readings.
 */

const TABLE_NAME = 'order_entry_cache_bound';

const table = pgTable(TABLE_NAME, {
  id: serial('id').primaryKey(),
  name: text('name'),
  metadata: jsonb('metadata'),
});

/** Fewer than the cache's entry cap, so a cache that keeps long entries is never cleared mid-run. */
const ENTRY_COUNT = 1000;

const MEGABYTE = 1024 * 1024;

const retainedHeapAfter = (opts: {
  dialect: PostgresQueryDialect;
  entryLength: number;
}): number => {
  const { dialect, entryLength } = opts;

  Bun.gc(true);
  const before = process.memoryUsage().heapUsed;

  for (let index = 0; index < ENTRY_COUNT; index++) {
    // Unknown column: the entry parses, then the call is a 400 - the shape of an abusive request.
    const entry = `${String(index).padStart(6, '0')}${'x'.repeat(entryLength)} DESC`;

    try {
      dialect.toOrderBy({ tableName: TABLE_NAME, schema: table, order: [entry] });
    } catch (error) {
      if (!isApplicationError(error) || error.statusCode !== 400) {
        throw error;
      }
    }
  }

  Bun.gc(true);
  return process.memoryUsage().heapUsed - before;
};

describe('toOrderBy - the parse cache does not hold long entries', () => {
  test('a thousand 16 KB entries leave no more than 2 MB behind on a live dialect', () => {
    const dialect = new PostgresQueryDialect();
    const retained = retainedHeapAfter({ dialect, entryLength: 16_000 });

    expect(retained).toBeLessThan(2 * MEGABYTE);
    // Keeps the dialect, and therefore its cache, reachable through the second heap reading.
    expect(
      dialect.toOrderBy({ tableName: TABLE_NAME, schema: table, order: ['name'] }),
    ).toHaveLength(2);
  });

  test('a thousand 2 KB entries leave no more than 1 MB behind on a live dialect', () => {
    const dialect = new PostgresQueryDialect();
    const retained = retainedHeapAfter({ dialect, entryLength: 2_000 });

    expect(retained).toBeLessThan(MEGABYTE);
    expect(
      dialect.toOrderBy({ tableName: TABLE_NAME, schema: table, order: ['name'] }),
    ).toHaveLength(2);
  });
});

/** Mirrors ORDER_ENTRY_CACHE_CAP and ORDER_ENTRY_CACHE_MAX_LENGTH in core/repositories/dialect/filter.ts. */
const CACHE_CAP = 1024;
const CACHE_MAX_LENGTH = 256;

/** The private cache, read by name. Renaming `_orderEntryCache` makes these tests fail loudly here. */
const readCache = (dialect: PostgresQueryDialect): Map<unknown, unknown> => {
  const cache: unknown = Reflect.get(dialect, '_orderEntryCache');

  if (!(cache instanceof Map)) {
    throw new Error(
      'expected FilterBuilder to hold its parsed order entries in a Map named _orderEntryCache',
    );
  }

  return cache;
};

describe('toOrderBy - the parse cache bounds, read from the cache', () => {
  const order = (dialect: PostgresQueryDialect, entry: string, expressions?: Record<string, SQL>) =>
    dialect.toOrderBy({ tableName: TABLE_NAME, schema: table, order: [entry], expressions });

  test('more distinct entries than the cap never grow the cache past the cap', () => {
    const dialect = new PostgresQueryDialect();
    let largest = 0;

    for (let index = 0; index < CACHE_CAP * 2 + 452; index++) {
      order(dialect, `metadata.key${index} DESC`);
      largest = Math.max(largest, readCache(dialect).size);
    }

    expect(largest).toBe(CACHE_CAP);
    expect(readCache(dialect).size).toBeGreaterThan(0);
    expect(readCache(dialect).size).toBeLessThanOrEqual(CACHE_CAP);
  });

  test('an entry of exactly the maximum length is cached', () => {
    const dialect = new PostgresQueryDialect();
    const key = 'k'.repeat(CACHE_MAX_LENGTH - ' DESC'.length);
    const entry = `${key} DESC`;

    expect(entry).toHaveLength(CACHE_MAX_LENGTH);
    order(dialect, entry, { [key]: sql`1` });
    expect(readCache(dialect).has(entry)).toBe(true);
  });

  test('an entry one character over the maximum is not cached, and still resolves', () => {
    const dialect = new PostgresQueryDialect();
    const key = 'k'.repeat(CACHE_MAX_LENGTH + 1 - ' DESC'.length);
    const entry = `${key} DESC`;

    expect(entry).toHaveLength(CACHE_MAX_LENGTH + 1);
    expect(order(dialect, entry, { [key]: sql`1` })).toHaveLength(2);
    expect(readCache(dialect).has(entry)).toBe(false);
    expect(readCache(dialect).size).toBe(0);
  });
});
