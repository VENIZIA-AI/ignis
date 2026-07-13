import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { resolveDatabaseDriver } from '@/connectors/postgres/drivers';
import { FakePool } from './fake-pg-client';
import { FakeSql } from './fake-postgres-js-client';

type TSchema = Record<string, never>;

describe('resolveDatabaseDriver', () => {
  test('a pg Pool resolves to NodePostgresDriver', async () => {
    const driver = await resolveDatabaseDriver<TSchema>({ client: new FakePool() });

    expect(driver.constructor.name).toBe('NodePostgresDriver');
  });

  test('a postgres-js Sql resolves to PostgresJsDriver', async () => {
    const driver = await resolveDatabaseDriver<TSchema>({ client: new FakeSql() });

    expect(driver.constructor.name).toBe('PostgresJsDriver');
  });

  test('the resolved driver wraps the client it was given', async () => {
    const sql = new FakeSql();
    const driver = await resolveDatabaseDriver<TSchema>({ client: sql });

    expect(driver.getClient()).toBe(sql);
  });

  test('a postgres-js Sql is not mistaken for a pg Pool', async () => {
    // Both clients expose `end()`. Detection must key on the distinctive verbs.
    const driver = await resolveDatabaseDriver<TSchema>({ client: new FakeSql() });

    expect(driver.constructor.name).not.toBe('NodePostgresDriver');
  });

  test('a client exposing both surfaces resolves postgres-js first - detection priority is pinned', async () => {
    const client = {
      connect: () => undefined,
      query: () => undefined,
      reserve: () => undefined,
      unsafe: () => undefined,
    } as AnyType;

    const driver = await resolveDatabaseDriver<TSchema>({ client });

    expect(driver.constructor.name).toBe('PostgresJsDriver');
  });

  for (const [label, client] of [
    ['undefined', undefined],
    ['null', null],
    ['a plain object', {}],
    ['a connection string', 'postgres://localhost/db'],
    ['an object with only end()', { end: () => undefined }],
  ] as const) {
    test(`${label} is rejected, naming both installable packages`, async () => {
      let caught: unknown;

      try {
        await resolveDatabaseDriver<TSchema>({ client });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
      expect((caught as Error).message).toContain('bun add pg');
      expect((caught as Error).message).toContain('bun add postgres');
    });
  }
});
