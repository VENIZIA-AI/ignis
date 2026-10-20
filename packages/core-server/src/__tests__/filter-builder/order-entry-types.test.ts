import { describe, expect, test } from 'bun:test';
import type { TFilter, TOrderEntry } from '@venizia/ignis-filter';
import type { TOrderEntry as TKernelOrderEntry } from '@venizia/ignis-kernel';

/**
 * Compile-time proof for the opt-in `TOrderEntry<T>`: a list checked with
 * `satisfies TOrderEntry<T>[]` accepts a column or a JSON path on a JSON column, optionally
 * followed by one space and a direction, and rejects a typo. `TFilter<T>.order` itself stays
 * `string[]`. Each `@ts-expect-error` is load-bearing - removing it must make `tsc` report a real
 * error on that line. A negative sits on its own line after a valid entry, so the error must land
 * on the element it guards.
 */

/** The read shape of a row: `metadata` and `settings` are jsonb columns. */
type TRow = {
  id: number;
  name: string;
  score: number | null;
  metadata: unknown;
  settings: { limits: { max: number } } | null;
  createdAt: Date;
};

describe('TOrderEntry<T> accepts', () => {
  test('a column entry in every direction spelling', () => {
    const order = [
      'name',
      'name asc',
      'name ASC',
      'name desc',
      'name DESC',
      'score DESC',
      'createdAt asc',
    ] satisfies TOrderEntry<TRow>[];
    expect(order).toHaveLength(7);
  });

  test('JSON-path entries on JSON columns', () => {
    const order = [
      'metadata.rank DESC',
      'metadata[0] asc',
      'metadata.items[0].name ASC',
      'settings.limits.max',
    ] satisfies TOrderEntry<TRow>[];
    expect(order).toHaveLength(4);
  });

  test('a checked list assigns to TFilter<T>.order', () => {
    const order = ['name DESC', 'metadata.rank asc'] satisfies TOrderEntry<TRow>[];
    const filter: TFilter<TRow> = { order };
    expect(filter.order).toEqual(['name DESC', 'metadata.rank asc']);
  });

  test('the kernel barrel re-exports the same type', () => {
    const order = ['name DESC', 'metadata.rank asc'] satisfies TKernelOrderEntry<TRow>[];
    expect(order).toHaveLength(2);
  });
});

describe('TOrderEntry<T> rejects', () => {
  test('a misspelled column', () => {
    const order = [
      'name DESC',
      // @ts-expect-error 'nmae' is not a column.
      'nmae DESC',
    ] satisfies TOrderEntry<TRow>[];
    expect(order).toHaveLength(2);
  });

  test('a misspelled column through the kernel barrel', () => {
    const order = [
      'name DESC',
      // @ts-expect-error 'nmae' is not a column.
      'nmae DESC',
    ] satisfies TKernelOrderEntry<TRow>[];
    expect(order).toHaveLength(2);
  });

  test('a misspelled JSON column', () => {
    const order = [
      'metadata.rank DESC',
      // @ts-expect-error 'metdata' is not a column.
      'metdata.rank DESC',
    ] satisfies TOrderEntry<TRow>[];
    expect(order).toHaveLength(2);
  });

  test('a path on a number column', () => {
    const order = [
      'metadata.rank DESC',
      // @ts-expect-error 'score' is a number column, not a JSON column.
      'score.rank DESC',
    ] satisfies TOrderEntry<TRow>[];
    expect(order).toHaveLength(2);
  });

  test('a path on a Date column', () => {
    const order = [
      'metadata.rank DESC',
      // @ts-expect-error 'createdAt' is a Date column, not a JSON column.
      'createdAt.day ASC',
    ] satisfies TOrderEntry<TRow>[];
    expect(order).toHaveLength(2);
  });

  test('a direction that is not asc or desc', () => {
    const order = [
      'name DESC',
      // @ts-expect-error 'sideways' is not a direction.
      'name sideways',
    ] satisfies TOrderEntry<TRow>[];
    expect(order).toHaveLength(2);
  });

  test('a mixed-case direction - the type takes asc, desc, ASC and DESC only', () => {
    const order = [
      'name DESC',
      // @ts-expect-error 'Desc' is neither all lower case nor all upper case.
      'name Desc',
    ] satisfies TOrderEntry<TRow>[];
    expect(order).toHaveLength(2);
  });

  test('a trailing token after the direction', () => {
    const order = [
      'name DESC',
      // @ts-expect-error an entry is a key and at most one direction.
      'name DESC NULLS',
    ] satisfies TOrderEntry<TRow>[];
    expect(order).toHaveLength(2);
  });
});

describe('TFilter<T>.order stays string[]', () => {
  test('accepts a string[] built at runtime', () => {
    const entries: string[] = ['anything', 'goes here'];
    const filter: TFilter<TRow> = { order: entries };
    expect(filter.order).toBe(entries);
  });

  test('accepts an entry built from a string field', () => {
    const field: string = 'name';
    const filter: TFilter<TRow> = { order: [`${field} DESC`, 'unknownColumn ASC'] };
    expect(filter.order).toEqual(['name DESC', 'unknownColumn ASC']);
  });
});
