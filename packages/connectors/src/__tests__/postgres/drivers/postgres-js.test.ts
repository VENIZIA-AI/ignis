import { describe, expect, test } from 'bun:test';
import { PostgresJsDriver } from '@/relational/postgres/drivers/postgres-js';
import { run } from './conformance/driver-conformance';
import { createFakeSql } from './fake-postgres-js-client';

type TSchema = Record<string, never>;

const build = (failOn?: string) => {
  const sql = createFakeSql({ failOn });
  const driver = new PostgresJsDriver<TSchema>({ client: sql });

  return {
    driver,
    statements: () => sql.reserved.flatMap((connection) => connection.statements),
    releases: () => sql.reserved.flatMap((connection) => connection.releases),
    ended: () => sql.ended,
  };
};

run({ driver: 'postgres-js', buildDriverProbe: build });

describe('PostgresJsDriver - postgres-js-specific behaviour', () => {
  test('acquire() reserves a dedicated connection per call', async () => {
    const sql = createFakeSql();
    const driver = new PostgresJsDriver<TSchema>({ client: sql });

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
    const sql = createFakeSql();
    const driver = new PostgresJsDriver<TSchema>({ client: sql });

    expect(driver.getClient()).toBe(sql);
  });
});
