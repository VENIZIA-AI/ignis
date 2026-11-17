import { describe, expect, test } from 'bun:test';
import type { TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import { datasource } from '@/base/metadata';
import { BasePostgresDataSource } from '@venizia/ignis-connectors/postgres';
import { NodePostgresDriver } from '@venizia/ignis-connectors/postgres/node-postgres';

interface IFakeClientSlot {
  totalCount: number;
  connect: () => Promise<{ query: () => Promise<{ rows: [] }>; release: () => void }>;
  end: () => Promise<void>;
}

const buildFakePool = (): IFakeClientSlot => {
  return {
    totalCount: 0,
    connect: () =>
      Promise.resolve({ query: () => Promise.resolve({ rows: [] }), release: () => {} }),
    end: () => Promise.resolve(),
  };
};

/** The current shape: the raw client goes in the non-deprecated slot. */
@datasource({ driver: NodePostgresDriver })
class ClientSlotDataSource extends BasePostgresDataSource<
  {},
  TAnyDataSourceSchema,
  {},
  IFakeClientSlot
> {
  constructor(private readonly rawClient: IFakeClientSlot) {
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
