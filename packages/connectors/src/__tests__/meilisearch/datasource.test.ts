import { describe, expect, test } from 'bun:test';
import { MeilisearchDataSource } from '@/search/meilisearch';

const buildDataSource = () =>
  new MeilisearchDataSource({
    name: 'meili-search',
    config: { host: 'http://localhost:7700' },
  });

describe('MeilisearchDataSource', () => {
  test('reports its search capabilities honestly - union is false, not faked', () => {
    expect(buildDataSource().getCapabilities()).toEqual({
      transactions: false,
      search: { vector: true, multi: true, union: false, synonyms: true },
    });
  });

  test('getConnector() before configure() throws', () => {
    expect(() => buildDataSource().getConnector()).toThrow(/configure/);
  });

  test('compileCollection produces an index plan, not a field schema', () => {
    const plan = buildDataSource().compileCollection({
      definition: { name: 'articles', fields: [{ name: 'id', type: 'string' }] },
    });

    expect(plan.uid).toBe('articles');
    expect(plan.primaryKey).toBe('id');
    expect(plan.settings['searchableAttributes']).toEqual(['*']);
  });

  test('autoProvision is off unless the env flag opts in', () => {
    const dataSource = buildDataSource();
    expect(dataSource['autoProvision']).toBe(false);
  });
});
