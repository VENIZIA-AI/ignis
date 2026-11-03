import { describe, expect, test } from 'bun:test';
import { MeilisearchInternal } from '@/search/meilisearch/internal';

describe('MeilisearchInternal.mapSearchResult - facets', () => {
  test('maps facetDistribution and facetStats onto one ISearchFacetCount per field', () => {
    const result = MeilisearchInternal.mapSearchResult({
      raw: {
        totalHits: 3,
        hits: [],
        facetDistribution: { genre: { drama: 2, comedy: 1 }, year: { '1999': 3 } },
        facetStats: { year: { min: 1999, max: 1999 } },
      },
    });

    expect(result.facetCounts).toEqual([
      {
        fieldName: 'genre',
        counts: [
          { value: 'drama', count: 2 },
          { value: 'comedy', count: 1 },
        ],
      },
      { fieldName: 'year', counts: [{ value: '1999', count: 3 }], stats: { min: 1999, max: 1999 } },
    ]);
  });

  test('drops a count that is not a number and a field that is not a record', () => {
    const result = MeilisearchInternal.mapSearchResult({
      raw: { totalHits: 0, facetDistribution: { genre: { drama: 'x', comedy: 1 }, bad: 5 } },
    });

    expect(result.facetCounts).toEqual([
      { fieldName: 'genre', counts: [{ value: 'comedy', count: 1 }] },
    ]);
  });

  test('a response without facetDistribution has no facetCounts', () => {
    const result = MeilisearchInternal.mapSearchResult({ raw: { totalHits: 0, hits: [] } });

    expect(result.facetCounts).toBeUndefined();
  });
});
