import { describe, test, expect } from 'bun:test';
import type { ICrudRepository } from '@/base/repositories';
import { DefaultSearchRepository } from '@/connectors/typesense/repositories';
import { FakeSearchDataSource, ProductDocument } from './fake-search-connector';

/**
 * `DefaultSearchRepository` must satisfy the neutral `ICrudRepository` contract - fails to
 * compile, not at runtime, if verb parity with the base `AbstractRepository` breaks.
 */
interface IProductDocument {
  id: string;
  title: string;
  secret?: string;
}

const assertDefaultSearchSatisfiesICrudRepository = (
  repo: DefaultSearchRepository<IProductDocument>,
): ICrudRepository<IProductDocument> => {
  return repo;
};

describe('DefaultSearchRepository satisfies ICrudRepository (type-level, compile-time only)', () => {
  test('assignment compiles - see assertDefaultSearchSatisfiesICrudRepository above', () => {
    const dataSource = new FakeSearchDataSource({ name: 'icrud-conformance-ds', config: {} });
    const repo = new DefaultSearchRepository<IProductDocument>(dataSource, {
      entityClass: ProductDocument,
    });

    expect(assertDefaultSearchSatisfiesICrudRepository(repo)).toBe(repo);
  });
});
