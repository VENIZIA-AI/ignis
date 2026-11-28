import { describe, expect, test } from 'bun:test';
import { SearchInputSchema } from '@/search/core/repositories/common/constants';

describe('a search filter refuses a key it does not have', () => {
  for (const key of ['wher', 'include']) {
    test(`${key} is an issue that names it`, () => {
      const result = SearchInputSchema.safeParse({ mode: 'keyword', filter: { [key]: [] } });

      expect(result.error?.issues).toMatchObject([
        { code: 'unrecognized_keys', keys: [key], path: ['filter'] },
      ]);
    });
  }

  test('the keys a search filter has parse', () => {
    const filter = { where: { id: '1' }, fields: ['id'], order: ['id ASC'], limit: 1 };

    expect(SearchInputSchema.safeParse({ mode: 'keyword', filter }).success).toBe(true);
  });
});
