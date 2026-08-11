import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { DefaultSearchRepository } from '@/connectors/search/repositories';
import { FakeSearchDataSource, ProductDocumentNoDefaultFilter } from './fake-search-connector';

/**
 * An ABSORBING where - `or: []`, `inq: []`, a bare `[]` - selects no document. It is the exact
 * inverse of the absent/empty where `unfiltered-bulk-write.test.ts` covers, and the two used to be
 * indistinguishable: both compiled to no `filterBy` at all.
 *
 * On the read path that silently widened the query to the whole collection. On the write path it
 * was worse - `deleteAll` treats a missing filter as licence to TRUNCATE when `force` is set, so
 * `deleteAll({ where: { or: permittedIds.map(...) }, options: { force: true } })` on an empty
 * permission list would have destroyed the collection it was scoped to protect.
 *
 * Every assertion checks BOTH the returned value and that the engine was never asked: a
 * correct-looking zero that still issued the call would mean the filter never actually narrowed.
 */
const buildRepository = () => {
  const dataSource = new FakeSearchDataSource({ name: 'absorbing-filter-ds', config: {} });
  const repository = new DefaultSearchRepository(dataSource, {
    entityClass: ProductDocumentNoDefaultFilter,
  });

  return { repository: repository as AnyType, connector: dataSource.fakeConnector as AnyType };
};

/** The permission-scope shape, spelled the way application code spells it. */
const emptyPermissionScope = () => {
  const permittedIds: string[] = [];
  return { or: permittedIds.map(id => ({ id })) };
};

describe('absorbing filter - read path', () => {
  test('find() returns no documents and never calls the engine', async () => {
    const { repository, connector } = buildRepository();

    const results = await repository.find({ filter: { where: emptyPermissionScope() } });

    expect(results).toEqual([]);
    expect(
      connector.searchCalls,
      'a search carrying no filterBy would have matched the entire collection',
    ).toHaveLength(0);
  });

  test('count() reports zero without asking the engine to count', async () => {
    const { repository, connector } = buildRepository();

    expect(await repository.count({ where: emptyPermissionScope() })).toEqual({ count: 0 });
    expect(connector.countDocumentsCalls).toHaveLength(0);
  });

  test('existsWith() is false', async () => {
    const { repository } = buildRepository();

    expect(await repository.existsWith({ where: emptyPermissionScope() })).toBe(false);
  });

  test('an absorbing clause ANDed with a real one still matches nothing', async () => {
    const { repository, connector } = buildRepository();

    const results = await repository.find({
      filter: { where: { and: [{ status: 'published' }, emptyPermissionScope()] } },
    });

    expect(results).toEqual([]);
    // Pre-fix, the empty disjunction evaporated and this ran as plain `status:=published`.
    expect(connector.searchCalls).toHaveLength(0);
  });

  test('`inq: []` is absorbing too', async () => {
    const { repository, connector } = buildRepository();

    expect(await repository.find({ filter: { where: { status: { inq: [] } } } })).toEqual([]);
    expect(connector.searchCalls).toHaveLength(0);
  });

  test('`nin: []` excludes nothing, so it still reaches the engine', async () => {
    const { repository, connector } = buildRepository();

    await repository.find({ filter: { where: { status: { nin: [] } } } });

    expect(
      connector.searchCalls,
      'excluding nothing is vacuously TRUE, not absorbing - this query must still run',
    ).toHaveLength(1);
  });
});

describe('absorbing filter - write path', () => {
  test('deleteAll does NOT truncate, even with force', async () => {
    const { repository, connector } = buildRepository();

    const result = await repository.deleteAll({
      where: emptyPermissionScope(),
      options: { force: true },
    });

    expect(result).toEqual({ count: 0, data: null });
    expect(
      connector.deleteAllDocumentsCalls,
      'an absorbing where must never reach the truncate branch - that deletes everything it was scoped to protect',
    ).toHaveLength(0);
    expect(connector.deleteByFilterCalls).toHaveLength(0);
  });

  test('deleteAll without force is a no-op, not a DENY - the where IS effective', async () => {
    const { repository, connector } = buildRepository();

    const result = await repository.deleteAll({ where: emptyPermissionScope() });

    expect(result).toEqual({ count: 0, data: null });
    expect(connector.deleteAllDocumentsCalls).toHaveLength(0);
  });

  test('updateAll updates nothing and never calls the engine', async () => {
    const { repository, connector } = buildRepository();

    const result = await repository.updateAll({
      data: { title: 'x' },
      where: emptyPermissionScope(),
    });

    expect(result).toEqual({ count: 0, data: null });
    expect(connector.updateByFilterCalls).toHaveLength(0);
  });
});
