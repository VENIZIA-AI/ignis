import { describe, expect, test } from 'bun:test';
import { SearchInputSchema, SearchModes } from '@/search/core/repositories/common';

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

  test('engineParams (the engine-specific escape hatch) parses on every non-raw mode', () => {
    const result = SearchInputSchema.safeParse({
      mode: SearchModes.KEYWORD,
      query: 'shoes',
      engineParams: { ['num_typos']: 2, ['pinned_hits']: '1:1' },
    });

    expect(result.success).toBe(true);
    if (result.success && result.data.mode === SearchModes.KEYWORD) {
      expect(result.data.engineParams).toEqual({ ['num_typos']: 2, ['pinned_hits']: '1:1' });
    }
  });

  test('Typesense-only knobs are no longer neutral params - they are stripped, not carried', () => {
    // numTypos/prefix/preset/... left the neutral shape and belong in engineParams under wire names, so passing them at the top level drops them - zod strips unknown keys from the object.
    const result = SearchInputSchema.safeParse({
      mode: SearchModes.KEYWORD,
      query: 'shoes',
      numTypos: 2,
      preset: 'p1',
      prefix: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('numTypos');
      expect(result.data).not.toHaveProperty('preset');
      expect(result.data).not.toHaveProperty('prefix');
    }
  });
});
