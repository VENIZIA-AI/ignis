// Import order guard: see route-registration.test.ts.
import '@/base/applications';

import { BaseApplication } from '@/base/applications';
import type { IApplicationConfigs } from '@/base/applications';
import { repository } from '@/base/metadata';
import { PGlite } from '@electric-sql/pglite';
import {
  BasePostgresDataSource,
  BasePostgresEntity,
  DefaultCRUDRepository,
  PostgresIdEnricher,
} from '@venizia/ignis-connectors/postgres';
import { PGliteCRUDRepository, PGliteDriver } from '@venizia/ignis-connectors/postgres/pglite';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import {
  datasource,
  type IApplicationInfo,
  model,
  type TAnyDataSourceSchema,
} from '@venizia/ignis-kernel';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

const memoTable = pgTable('PgliteDiMemo', {
  ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  title: text('title').notNull(),
});

@model({ type: 'entity' })
class Memo extends BasePostgresEntity<typeof Memo.schema> {
  static override schema = memoTable;
}

@datasource({ driver: PGliteDriver })
class MemoryDataSource extends BasePostgresDataSource<{}, TAnyDataSourceSchema, {}, PGlite> {
  constructor() {
    super({ name: MemoryDataSource.name, config: {} });
  }

  override async configure(): Promise<void> {
    const client = new PGlite();
    await client.waitReady;
    await client.exec('CREATE TABLE "PgliteDiMemo" (id text PRIMARY KEY, title text NOT NULL);');

    this.client = client;
  }

  override getConnectionString(): string {
    return 'pglite://memory';
  }
}

/** The short form for PGlite. */
@repository({ model: Memo, dataSource: MemoryDataSource })
class PGliteMemoRepository extends PGliteCRUDRepository<typeof memoTable> {}

/** The form the framework always had. */
@repository({ model: Memo, dataSource: MemoryDataSource })
class DefaultMemoRepository extends DefaultCRUDRepository<typeof memoTable> {}

class DiApplication extends BaseApplication {
  constructor() {
    super({
      scope: 'DiApplication',
      config: {
        host: '127.0.0.1',
        port: 0,
        path: { base: '/', isStrict: false },
      } as IApplicationConfigs,
    });
  }

  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'pglite-di', version: '0.0.0', description: '' };
  }

  staticConfigure(): void {}

  preConfigure(): void {
    this.dataSource(MemoryDataSource);
    this.repository(PGliteMemoRepository);
    this.repository(DefaultMemoRepository);
  }

  postConfigure(): void {}
  setupMiddlewares(): void {}
}

describe('PGliteCRUDRepository through dependency injection, on a real PGlite', () => {
  let application: DiApplication;

  beforeAll(async () => {
    application = new DiApplication();
    application.init();
    await application.initialize();
  });

  afterAll(async () => {
    await application.stop();
  });

  test('the container resolves both repositories and injects the same datasource into each', () => {
    const viaPGlite = application.get<PGliteMemoRepository>({
      key: 'repositories.PGliteMemoRepository',
    });
    const viaDefault = application.get<DefaultMemoRepository>({
      key: 'repositories.DefaultMemoRepository',
    });

    expect(viaPGlite).toBeInstanceOf(PGliteMemoRepository);
    expect(viaPGlite).toBeInstanceOf(DefaultCRUDRepository);
    expect(viaDefault).toBeInstanceOf(DefaultMemoRepository);
    expect(viaPGlite.dataSource).toBeInstanceOf(MemoryDataSource);
    expect(viaPGlite.dataSource as unknown).toBe(viaDefault.dataSource);
    expect(viaPGlite.dataSource.getClient()).toBeInstanceOf(PGlite);
  });

  test('a write and a read work through the PGlite form, and the default form sees the row', async () => {
    const viaPGlite = application.get<PGliteMemoRepository>({
      key: 'repositories.PGliteMemoRepository',
    });
    const viaDefault = application.get<DefaultMemoRepository>({
      key: 'repositories.DefaultMemoRepository',
    });

    const created = await viaPGlite.create({ data: { title: 'written through the PGlite form' } });
    const found = await viaPGlite.findById({ id: created.data!.id });
    const other = await viaDefault.findById({ id: created.data!.id });

    expect(created.data?.title).toBe('written through the PGlite form');
    expect(found?.title).toBe('written through the PGlite form');
    expect(other?.title).toBe('written through the PGlite form');
  });
});
