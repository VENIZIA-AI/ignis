import { describe, test, expect, beforeEach } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers/common';

import type { ICrudRepository } from '@/base/repositories';
import { DefaultSearchRepository } from '@/connectors/typesense/repositories';
import { FakeSearchDataSource, ProductDocument } from './fake-search-connector';

interface IProductDocument {
  id: string;
  title: string;
  secret?: string;
}

/** The drift this guards is invisible to `tsc`: method parameters are bivariant, so a search `findById` that declares no `filter` still satisfies the base contract and drops a caller's projection at runtime. */
describe('findById carries the projection filter', () => {
  let dataSource: FakeSearchDataSource;
  let repository: DefaultSearchRepository<IProductDocument>;

  beforeEach(() => {
    dataSource = new FakeSearchDataSource({ name: 'find-by-id-filter-ds', config: {} });
    repository = new DefaultSearchRepository<IProductDocument>(dataSource, {
      entityClass: ProductDocument,
    });

    dataSource.fakeConnector.searchResponse = {
      found: 1,
      isFoundExact: true,
      hits: [{ document: { id: '1', title: 'A' } }],
    };
  });

  test('a caller holding the NEUTRAL contract reaches the engine with fields intact', async () => {
    const neutral: ICrudRepository<IProductDocument> = repository;

    await neutral.findById({ id: '1', filter: { fields: ['title'] } });

    const [call] = dataSource.fakeConnector.searchCalls;
    const params = call.params as Record<string, unknown>;

    expect(params['include_fields']).toBe('title');
    expect(params['filter_by']).toBe('(isActive:=true && id:=`1`)');
  });

  test('a projection never overrides the id lookup or the default filter', async () => {
    const untyped = repository as AnyType;

    await untyped.findById({ id: '1', filter: { fields: ['title'], where: { id: 'spoofed' } } });

    const [call] = dataSource.fakeConnector.searchCalls;
    const params = call.params as Record<string, unknown>;

    expect(params['filter_by']).toBe('(isActive:=true && id:=`1`)');
  });

  test('hidden fields still win over a projection that names them', async () => {
    await repository.findById({ id: '1', filter: { fields: ['title', 'secret'] } });

    const [call] = dataSource.fakeConnector.searchCalls;
    const params = call.params as Record<string, unknown>;

    expect(params['exclude_fields']).toBe('secret');
  });

  test('an omitted filter keeps the plain id lookup', async () => {
    await repository.findById({ id: '1' });

    const [call] = dataSource.fakeConnector.searchCalls;
    const params = call.params as Record<string, unknown>;

    expect(params['include_fields']).toBeUndefined();
    expect(params['filter_by']).toBe('(isActive:=true && id:=`1`)');
  });
});
