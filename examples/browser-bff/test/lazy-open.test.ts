// The Worker starts without PGlite: the datasource opens at the first request that needs the database.
import 'reflect-metadata';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Application } from '../src/worker/application';
import { PGliteDataSource } from '../src/worker/datasources/pglite.datasource';
import { NoteRepository } from '../src/worker/repositories/note.repository';

const boot = async () => {
  const application = new Application({
    scope: 'Application',
    config: { path: { base: '/api', isStrict: false }, host: '127.0.0.1', port: 0 },
  });

  application.init();
  application.dataSource(PGliteDataSource);
  application.repository(NoteRepository);
  await application.registerDataSources();

  return {
    application,
    dataSource: application.get<PGliteDataSource>({ key: 'datasources.PGliteDataSource' }),
    notes: application.get<NoteRepository>({ key: 'repositories.NoteRepository' }),
  };
};

describe('browser-bff opens PGlite on first use', () => {
  let stop: (() => Promise<void>) | undefined;

  beforeEach(() => {
    // Unset means an in-memory database.
    delete process.env.APP_ENV_PGLITE_DATA_DIR;
  });

  afterEach(async () => {
    await stop?.();
    stop = undefined;
  });

  test('the application boots and the datasource is not open: no PGlite is built', async () => {
    const { application, dataSource } = await boot();
    stop = () => dataSource.close().then(() => application.stop());

    expect(dataSource.isOpenDeferred()).toBe(true);
    expect(dataSource.isOpen()).toBe(false);
    expect(() => dataSource.getClient()).toThrow(/opens on first use and is not open/);
  });

  test('the first repository call opens it, runs the migrations inside the open, and answers', async () => {
    const { application, dataSource, notes } = await boot();
    stop = () => dataSource.close().then(() => application.stop());

    const created = await notes.create({ data: { title: 'opened on first use' } });

    expect(created.data?.title).toBe('opened on first use');
    expect(dataSource.isOpen()).toBe(true);
  });

  test('concurrent first calls share the one open: the migrations run once and every row is written', async () => {
    const { application, dataSource, notes } = await boot();
    stop = () => dataSource.close().then(() => application.stop());

    expect(dataSource.isOpen()).toBe(false);

    await Promise.all(
      Array.from({ length: 6 }, (_unused, index) => notes.create({ data: { title: `n${index}` } })),
    );

    expect(dataSource.isOpen()).toBe(true);
    expect(await notes.count({ where: {} })).toEqual({ count: 6 });
  });
});
