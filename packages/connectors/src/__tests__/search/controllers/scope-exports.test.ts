import { describe, expect, test } from 'bun:test';
import type { TSearchScopeResolver } from '@/search/core/controllers';

/**
 * `defineSearchController` returns a class whose type mentions `TSearchScopeResolver`. A consumer
 * that keeps the result in a const (`const Base = SearchControllerFactory.defineSearchController(...)`)
 * needs the type to be reachable from the package entry, or tsc reports TS2883 (the inferred type
 * cannot be named). This file fails to compile when the barrel stops exporting it.
 */
describe('the search controllers barrel', () => {
  test('exports TSearchScopeResolver', () => {
    const resolver: TSearchScopeResolver = () => ({ status: 'active' });

    expect(resolver({ context: {} as never })).toEqual({ status: 'active' });
  });
});
