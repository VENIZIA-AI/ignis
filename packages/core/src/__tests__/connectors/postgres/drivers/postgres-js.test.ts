import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { PostgresJsDriver } from '@/connectors/postgres/drivers/postgres-js';
import { run } from './conformance/driver-conformance';
import { FakeSql } from './fake-postgres-js-client';

type TSchema = Record<string, never>;

const build = (failOn?: string) => {
  const sql = new FakeSql({ failOn });
  const driver = new PostgresJsDriver<TSchema>({ client: sql as AnyType });

  return {
    driver,
    statements: () => sql.reserved.flatMap(connection => connection.statements),
    releases: () => sql.reserved.flatMap(connection => connection.releases),
    ended: () => sql.ended,
  };
};

run({ driver: 'postgres-js', buildDriverProbe: build });

describe('PostgresJsDriver - postgres-js-specific behaviour', () => {
  test('acquire() reserves a dedicated connection per call', async () => {
    const sql = new FakeSql();
    const driver = new PostgresJsDriver<TSchema>({ client: sql as AnyType });

    await driver.acquire({ schema: {} });
    await driver.acquire({ schema: {} });

    expect(sql.reserved).toHaveLength(2);
  });

  test('execute() routes through unsafe(), not the tagged template', async () => {
    const { driver, statements } = build();
    const connection = await driver.acquire({ schema: {} });

    await connection.execute({ statement: 'BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE' });
    connection.release();

    expect(statements()).toEqual(['BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE']);
  });

  test('release({ destroy: true }) CANNOT destroy - postgres-js pools the connection anyway', async () => {
    const { driver, releases } = build();
    const connection = await driver.acquire({ schema: {} });

    connection.release({ destroy: true });

    // The documented asymmetry with node-postgres, pinned so it cannot regress into a silent assumption that every driver discards poisoned connections.
    expect(releases()).toEqual([{ destroyed: false }]);
  });

  test('getClient() returns the sql client the driver was constructed with', () => {
    const sql = new FakeSql();
    const driver = new PostgresJsDriver<TSchema>({ client: sql as AnyType });

    expect(driver.getClient()).toBe(sql as AnyType);
  });
});
