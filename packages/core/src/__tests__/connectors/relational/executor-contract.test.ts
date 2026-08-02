import { describe, expect, test } from 'bun:test';
import type { IRelationalQueryExecutor } from '@/connectors/relational/repositories/common';

/** The port's own verb set, read off the interface rather than kept by hand. */
type TExecutorVerb = keyof IRelationalQueryExecutor<unknown>;

/** Exhaustive BY CONSTRUCTION, and the only reason the verb test below has teeth: `Record<TExecutorVerb, true>` refuses to compile with a verb missing, and the literal's excess-property check refuses an invented one. `bun test` erases types, so that guarantee is enforced by `bun run typecheck` and the build, not at runtime - the runtime assertions only pin the count and the spelling. An earlier version of this test enumerated the fake's own object literal and passed unchanged while the port carried eight verbs. */
const EXECUTOR_VERBS: Record<TExecutorVerb, true> = {
  count: true,
  findFirst: true,
  findMany: true,
  insert: true,
  remove: true,
  select: true,
  update: true,
};

/** Records calls instead of touching a database - the port must be satisfiable with no engine at all. */
const createFakeExecutor = (): IRelationalQueryExecutor<unknown> & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    select: async () => {
      calls.push('select');
      return [];
    },
    count: async () => {
      calls.push('count');
      return 0;
    },
    findMany: async () => {
      calls.push('findMany');
      return [];
    },
    findFirst: async () => {
      calls.push('findFirst');
      return null;
    },
    insert: async () => {
      calls.push('insert');
      return { count: 1, rows: [] };
    },
    update: async () => {
      calls.push('update');
      return { count: 1, rows: [] };
    },
    remove: async () => {
      calls.push('remove');
      return { count: 1, rows: [] };
    },
  };
};

describe('IRelationalQueryExecutor', () => {
  test('is implementable without an engine', async () => {
    const executor = createFakeExecutor();
    await executor.select({ connector: {}, table: {} as never });
    await executor.count({ connector: {}, table: {} as never });
    expect(executor.calls).toEqual(['select', 'count']);
  });

  test('exposes exactly seven verbs, and an implementation supplies all of them', () => {
    const declaredVerbs = Object.keys(EXECUTOR_VERBS).sort();

    expect(declaredVerbs).toEqual([
      'count',
      'findFirst',
      'findMany',
      'insert',
      'remove',
      'select',
      'update',
    ]);

    const implementedVerbs = Object.keys(createFakeExecutor())
      .filter(key => key !== 'calls')
      .sort();
    expect(implementedVerbs).toEqual(declaredVerbs);
  });

  test('a write reports a count even when it returns no rows', async () => {
    const executor = createFakeExecutor();
    const result = await executor.insert({
      connector: {},
      table: {} as never,
      values: { email: 'a@b.c' },
      shouldReturn: false,
    });
    expect(result.rows).toEqual([]);
    expect(typeof result.count).toBe('number');
    expect(result.count).toBe(1);
  });
});
