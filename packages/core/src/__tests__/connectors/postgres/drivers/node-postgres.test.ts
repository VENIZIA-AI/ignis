import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { NodePostgresDriver } from '@/connectors/postgres/drivers/node-postgres';
import { run } from './conformance/driver-conformance';
import { FakePool } from './fake-pg-client';

type TSchema = Record<string, never>;

const build = (failOn?: string) => {
  const pool = new FakePool({ failOn });
  const driver = new NodePostgresDriver<TSchema>({ client: pool as AnyType });

  return {
    driver,
    statements: () => pool.clients.flatMap(client => client.statements),
    releases: () => pool.clients.flatMap(client => client.releases),
    ended: () => pool.ended,
  };
};

run({ driver: 'node-postgres', buildDriverProbe: build });

describe('NodePostgresDriver - pg-specific behaviour', () => {
  test('release({ destroy: true }) passes a truthy arg to pg, destroying the connection', async () => {
    const { driver, releases } = build();
    const connection = await driver.acquire({ schema: {} });

    connection.release({ destroy: true });

    // pg's `release(err)` discards the connection instead of returning it to the pool.
    expect(releases()).toEqual([{ destroyed: true }]);
  });

  test('release() with no options returns the connection to the pool', async () => {
    const { driver, releases } = build();
    const connection = await driver.acquire({ schema: {} });

    connection.release();

    expect(releases()).toEqual([{ destroyed: false }]);
  });

  test('release({ destroy: false }) pools the connection, it does not destroy it', async () => {
    const { driver, releases } = build();
    const connection = await driver.acquire({ schema: {} });

    connection.release({ destroy: false });

    expect(releases()).toEqual([{ destroyed: false }]);
  });

  test('acquire() checks out a NEW client per call, not the pool itself', async () => {
    const pool = new FakePool();
    const driver = new NodePostgresDriver<TSchema>({ client: pool as AnyType });

    await driver.acquire({ schema: {} });
    await driver.acquire({ schema: {} });

    // BEGIN/COMMIT must land on the same backend, so each transaction gets its own PoolClient.
    expect(pool.clients).toHaveLength(2);
  });

  test('getClient() returns the pool the driver was constructed with', () => {
    const pool = new FakePool();
    const driver = new NodePostgresDriver<TSchema>({ client: pool as AnyType });

    expect(driver.getClient()).toBe(pool as AnyType);
  });
});
