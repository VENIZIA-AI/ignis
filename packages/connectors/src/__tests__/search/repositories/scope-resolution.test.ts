import { describe, test, expect } from 'bun:test';
import { ReadableSearchRepository } from '@/search/typesense/repositories';

// Regression guard: an explicit scope must win over entityClass.name when there is no entityClass.
describe('repository scope resolution regression', () => {
  test('search repository honors an explicit scope with no entityClass', () => {
    const repo = new ReadableSearchRepository(undefined, { scope: 'MySearchScope' });
    expect(repo.scope).toBe('MySearchScope');
    expect(repo.scope).not.toBe('Repository');
  });
});
