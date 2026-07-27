import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { datasource } from '@/base/metadata';
import { BasePostgresDataSource } from '@/connectors/postgres';
import { NodePostgresDriver } from '@/connectors/postgres/drivers/node-postgres';

const buildFakePool = (): AnyType => {
  return {
    totalCount: 0,
    connect: () =>
      Promise.resolve({ query: () => Promise.resolve({ rows: [] }), release: () => {} }),
    end: () => Promise.resolve(),
  };
};

/** The current shape: the raw client goes in the non-deprecated slot. */
@datasource({ driver: NodePostgresDriver })
class ClientSlotDataSource extends BasePostgresDataSource<{}> {
  constructor(private readonly rawClient: AnyType) {
    super({ name: 'client-slot', config: {} });
  }

  configure(): void {
    this['client'] = this.rawClient;
  }

  getConnectionString(): string {
    return '';
  }
}

describe('AbstractRelationalDataSource - the raw client slot', () => {
  test('a datasource assigning the client slot directly behaves identically', async () => {
    const rawClient = buildFakePool();
    const dataSource = new ClientSlotDataSource(rawClient);
    dataSource.configure();

    expect(dataSource.getClient()).toBe(rawClient);

    const driver = dataSource['resolveDriver']();
    expect(typeof driver.acquire).toBe('function');
  });

  test('with neither a driver nor a client, getClient() throws instead of returning undefined', () => {
    class BareDataSource extends BasePostgresDataSource<{}> {
      configure(): void {
        // Nothing wired at all.
      }

      getConnectionString(): string {
        return '';
      }
    }

    const dataSource = new BareDataSource({ name: 'bare', config: {} });

    expect(() => dataSource.getClient()).toThrow(/No driver and no client/);
  });
});
