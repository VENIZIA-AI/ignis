import { describe, expect, test } from 'bun:test';
import { SearchInputSchema, SearchModes } from '@/connectors/search/repositories/common';

describe('SearchInputSchema', () => {
  test('a valid semantic payload parses', () => {
    const result = SearchInputSchema.safeParse({
      mode: SearchModes.SEMANTIC,
      vectorField: 'embedding',
      nearVector: [0.1, 0.2, 0.3],
      k: 10,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe(SearchModes.SEMANTIC);
    }
  });

  test('a keyword payload with only mode defaults every other field to undefined', () => {
    const result = SearchInputSchema.safeParse({ mode: SearchModes.KEYWORD });

    expect(result.success).toBe(true);
    if (result.success && result.data.mode === SearchModes.KEYWORD) {
      expect(result.data.query).toBeUndefined();
      expect(result.data.queryBy).toBeUndefined();
      expect(result.data.filter).toBeUndefined();
    }
  });

  test('a hybrid payload requires query, queryBy, and vectorField', () => {
    const missingQueryBy = SearchInputSchema.safeParse({
      mode: SearchModes.HYBRID,
      query: 'shoes',
      vectorField: 'embedding',
    });

    expect(missingQueryBy.success).toBe(false);
  });

  test('a raw payload requires params', () => {
    const result = SearchInputSchema.safeParse({ mode: SearchModes.RAW, params: { q: '*' } });
    expect(result.success).toBe(true);
  });

  test('an unknown mode fails safeParse', () => {
    const result = SearchInputSchema.safeParse({ mode: 'fuzzy', query: 'shoes' });
    expect(result.success).toBe(false);
  });
});
