import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { DefaultSearchRepository } from '@/search/core/repositories';
import { FakeSearchDataSource, ProductDocumentNoDefaultFilter } from './fake-search-connector';

/** An unfiltered bulk write is a data-destruction primitive: `deleteBy({ where: {} })` compiles to an empty filter and truncate reports no count, so nothing surfaces the damage - the search tier demands `force`, exactly as postgres always has. */
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

describe('deleteBy without an effective where', () => {
  test('an empty where is refused - it compiles to no filter at all', async () => {
    const { repository, connector } = buildRepository();

    const result = await messageOf(repository.deleteBy({ where: {} }));
    expect(result).toContain('DENY');
    expect(connector.deleteAllDocumentsCalls).toHaveLength(0);
  });

  test('force: true is the ONLY way to truncate, and it is explicit', async () => {
    const { repository, connector } = buildRepository();

    const result = await repository.deleteBy({ where: {}, options: { force: true } });

    expect(result).toEqual({ count: 0, data: null });
    expect(connector.deleteAllDocumentsCalls).toHaveLength(1);
  });

  test('a real where still deletes by filter, no force needed', async () => {
    const { repository, connector } = buildRepository();

    await repository.deleteBy({ where: { name: 'x' } });

    expect(connector.deleteAllDocumentsCalls).toHaveLength(0);
    expect(connector.deleteByFilterCalls).toHaveLength(1);
  });
});

describe('updateBy without an effective where', () => {
  test('is refused - there is no unfiltered bulk update on a search engine', async () => {
    const { repository } = buildRepository();

    const result = await messageOf(repository.updateBy({ data: { name: 'x' }, where: {} }));
    expect(result).toContain('DENY');
  });
});
