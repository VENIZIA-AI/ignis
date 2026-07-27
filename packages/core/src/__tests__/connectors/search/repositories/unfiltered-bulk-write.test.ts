import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { DefaultSearchRepository } from '@/connectors/search/repositories';
import { FakeSearchDataSource, ProductDocumentNoDefaultFilter } from './fake-search-connector';

/** An unfiltered bulk write is a data-destruction primitive: `deleteAll({ where: {} })` compiles to an empty filter and truncate reports no count, so nothing surfaces the damage - the search tier demands `force`, exactly as postgres always has. */
const buildRepository = () => {
  const dataSource = new FakeSearchDataSource({ name: 'bulk-write-ds', config: {} });
  const repository = new DefaultSearchRepository(dataSource, {
    entityClass: ProductDocumentNoDefaultFilter,
  });

  return { repository: repository as AnyType, connector: dataSource.fakeConnector as AnyType };
};

const messageOf = async (task: Promise<unknown>): Promise<string> => {
  try {
    await task;
    return 'DID NOT THROW';
  } catch (error) {
    return (error as Error).message;
  }
};

describe('deleteAll without an effective where', () => {
  test('an ABSENT where is refused, not silently turned into a truncate', async () => {
    const { repository, connector } = buildRepository();

    expect(await messageOf(repository.deleteAll())).toContain('DENY');
    expect(connector.deleteAllDocumentsCalls).toHaveLength(0);
  });

  test('an EMPTY where object is refused too - it compiles to no filter at all', async () => {
    const { repository, connector } = buildRepository();

    expect(await messageOf(repository.deleteAll({ where: {} }))).toContain('DENY');
    expect(connector.deleteAllDocumentsCalls).toHaveLength(0);
  });

  test('force: true is the ONLY way to truncate, and it is explicit', async () => {
    const { repository, connector } = buildRepository();

    const result = await repository.deleteAll({ options: { force: true } });

    expect(result).toEqual({ count: 0, data: null });
    expect(connector.deleteAllDocumentsCalls).toHaveLength(1);
  });

  test('a real where still deletes by filter, no force needed', async () => {
    const { repository, connector } = buildRepository();

    await repository.deleteAll({ where: { name: 'x' } });

    expect(connector.deleteAllDocumentsCalls).toHaveLength(0);
    expect(connector.deleteByFilterCalls).toHaveLength(1);
  });
});

describe('updateAll without an effective where', () => {
  test('is refused - there is no unfiltered bulk update on a search engine', async () => {
    const { repository } = buildRepository();

    expect(await messageOf(repository.updateAll({ data: { name: 'x' }, where: {} }))).toContain(
      'DENY',
    );
  });
});
