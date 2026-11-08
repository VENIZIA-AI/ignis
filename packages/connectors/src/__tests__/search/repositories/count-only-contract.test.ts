import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers/common';
import type { DefaultSearchRepository } from '@/search/core';
import type { DefaultCRUDRepository } from '@/relational/postgres';

declare const searchRepository: DefaultSearchRepository<AnyType>;
declare const postgresRepository: DefaultCRUDRepository<AnyType>;

/** Compile-time contract: bulk writes on search engines are count-only - `shouldReturn` is rejected at the TYPE level for search updateBy/deleteBy, while postgres keeps its full overloads. */
async function probeCompileOnly() {
  const updated = await searchRepository.updateBy({ data: { title: 'x' }, where: { id: '1' } });
  const updatedData: null = updated.data;

  const deleted = await searchRepository.deleteBy({ where: { id: '1' } });
  const deletedData: null = deleted.data;

  await searchRepository.updateBy({
    data: { title: 'x' },
    where: { id: '1' },
    options: {
      // @ts-expect-error shouldReturn is not part of the search bulk-write contract
      shouldReturn: true,
    },
  });
  await searchRepository.deleteBy({
    where: { id: '1' },
    options: {
      // @ts-expect-error shouldReturn is not part of the search bulk-write contract
      shouldReturn: false,
    },
  });

  const postgresUpdated = await postgresRepository.updateBy({
    data: { title: 'x' },
    where: { id: '1' },
  });
  const postgresRows: Array<AnyType> = postgresUpdated.data;

  return { updatedData, deletedData, postgresRows };
}

describe('search bulk-write count-only contract', () => {
  test('the compile-time probe above is the real gate; this proves the module loads', () => {
    expect(typeof probeCompileOnly).toBe('function');
  });
});
