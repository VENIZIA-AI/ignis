import { describe, expect, test } from 'bun:test';
import type { ISearchConnector } from '@/search/core';
import { DefaultSearchRepository } from '@/search/core/repositories';
import type { TypesenseConnector, TypesenseDataSource } from '@/search/typesense';

/** `tsc --noEmit` is the real gate; `bun test` only proves the module loads. The connector type follows the datasource type parameter, making an engine-only verb a compile-time matter. */
describe('SearchBaseRepository - the connector type follows the datasource', () => {
  class TypesenseBoundRepository extends DefaultSearchRepository<
    { id: string },
    TypesenseDataSource
  > {
    /** Bound to a concrete datasource: `alias` is REQUIRED, reached with no `?.` and no cast. */
    aliasGroup(): TypesenseConnector['alias'] {
      return this.connector.alias;
    }
  }

  class PortableRepository extends DefaultSearchRepository<{ id: string }> {
    /** Engine-agnostic: `alias` is OPTIONAL, so the compiler forces the `?.` narrowing. */
    aliasGroup(): ISearchConnector['alias'] {
      return this.connector.alias;
    }
  }

  test('both repository shapes compile', () => {
    expect(TypesenseBoundRepository.name).toBe('TypesenseBoundRepository');
    expect(PortableRepository.name).toBe('PortableRepository');
  });

  test('the neutral connector declares the engine-varying groups as optional', () => {
    const connector = {} as ISearchConnector;

    // Present on the type as optional; absent at runtime on a connector that has no alias support.
    expect(connector.alias).toBeUndefined();
    expect(connector.swap).toBeUndefined();
    expect(connector.synonymSet).toBeUndefined();
    expect(connector.synonyms).toBeUndefined();
  });
});
