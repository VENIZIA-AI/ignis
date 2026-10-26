import { describe, expect, test } from 'bun:test';
import {
  captureRejection,
  FakeClient,
  FakeConnector,
  FakeDataSource,
  FakeDriver,
} from './fake-engine';

const configured = () => {
  const dataSource = new FakeDataSource();
  dataSource.configure();
  return dataSource;
};

describe('BaseRawSqlDataSource - wiring', () => {
  test('builds the connector from the driver named by @datasource, over the client configure() made', async () => {
    const dataSource = configured();

    const connector = dataSource.getConnector();

    expect(connector).toBeInstanceOf(FakeConnector);
    expect(connector.hostName()).toBe('analytics.local');
    expect(dataSource.getClient()).toBe(dataSource.builds[0]);
  });

  test('execute() goes through the connector and returns its rows', async () => {
    const dataSource = configured();

    const result = await dataSource.execute('select 1');

    expect(result.rows).toEqual([{ host: 'analytics.local', statement: 'select 1' }]);
    expect(dataSource.builds[0]?.statements).toEqual(['select 1']);
  });

  test('the connector is built once, however often it is asked for', () => {
    const dataSource = configured();

    expect(dataSource.getConnector()).toBe(dataSource.getConnector());
  });

  test('a datasource with no client and no driver says what is missing', () => {
    const dataSource = new FakeDataSource();

    expect(() => dataSource.getConnector()).toThrow('No driver and no client');
    expect(() => dataSource.getClient()).toThrow('No driver and no client');
  });

  test('owns no schema and reports no transactions', async () => {
    const dataSource = new FakeDataSource();

    expect(dataSource.getSchema()).toEqual({});
    expect(dataSource.getCapabilities()).toEqual({ transactions: false });
    expect(String(await captureRejection(() => dataSource.beginTransaction()))).toMatch(
      /not supported/i,
    );
  });

  test('a custom driver wired by hand replaces the metadata driver', () => {
    class HandWired extends FakeDataSource {
      wire(): FakeClient {
        const client = new FakeClient({ host: 'hand.local' });
        this.useDriver({ driver: new FakeDriver({ client }) });
        return client;
      }
    }

    const dataSource = new HandWired();
    const client = dataSource.wire();

    expect(dataSource.getConnector().hostName()).toBe('hand.local');
    expect(dataSource.getClient()).toBe(client);
  });
});

describe('BaseRawSqlDataSource - close', () => {
  test('ends the engine through its driver, once', async () => {
    const dataSource = configured();
    const client = dataSource.builds[0];

    const first = dataSource.close();
    const second = dataSource.close();
    await Promise.all([first, second]);

    expect(second).toBe(first);
    expect(client?.ended).toBe(true);
  });

  test('a datasource that was never configured closes without touching anything', async () => {
    const dataSource = new FakeDataSource();

    expect(await captureRejection(() => dataSource.close())).toBeUndefined();
  });
});

describe('BaseRawSqlDataSource - secret rotation', () => {
  test('rebuilds against the rotated credentials, swaps the connector and drains the old client', async () => {
    const dataSource = configured();
    const oldClient = dataSource.builds[0];
    const oldConnector = dataSource.getConnector();

    await dataSource.onSecretRotated({ key: 'warehouse', secret: { password: 'new-pass' } });

    const newClient = dataSource.builds[1];
    expect(newClient).toBeDefined();
    expect(newClient).not.toBe(oldClient);
    expect(dataSource.getClient()).toBe(newClient);
    expect(dataSource.getConnector()).not.toBe(oldConnector);
    expect(oldClient?.ended).toBe(true);
    expect(newClient?.ended).toBe(false);
    // The secret is mapped onto settings the way every connector family does.
    expect(dataSource.getSettings()).toMatchObject({ password: 'new-pass' });
  });

  test('a failed rebuild keeps the old client serving and restores the settings', async () => {
    const dataSource = configured();
    const oldClient = dataSource.builds[0];
    dataSource.failNextConfigure = true;

    const error = await captureRejection(() =>
      dataSource.onSecretRotated({ key: 'warehouse', secret: { password: 'bad' } }),
    );

    expect(String(error)).toContain('bad rotated token');

    expect(dataSource.getClient()).toBe(oldClient);
    expect(oldClient?.ended).toBe(false);
    expect(dataSource.getSettings()).not.toHaveProperty('password');
    // The half-built client was drained, not leaked.
    expect(dataSource.builds[1]?.ended).toBe(true);
  });
});
