import { SymbolStore } from '@/symbols';
import type { ISymbolRecord } from '@/symbols';
import { describe, expect, test } from 'bun:test';

const record = (opts: Partial<ISymbolRecord> & { name: string }): ISymbolRecord => ({
  package: '@venizia/ignis-helpers',
  subpath: '.',
  specifier: '@venizia/ignis-helpers',
  kind: 'function',
  file: 'packages/helpers/src/modules/error/error.ts',
  line: 42,
  signature: `${opts.name}(): void`,
  ...opts,
});

const SYMBOLS: ISymbolRecord[] = [
  record({ name: 'getError' }),
  record({ name: 'respond', package: '@venizia/ignis', specifier: '@venizia/ignis' }),
  record({ name: 'respond', package: '@venizia/ignis-kernel', specifier: '@venizia/ignis-kernel' }),
  record({ name: 'respondError' }),
  record({ name: 'BaseHelper', kind: 'class' }),
];

const buildStore = (): SymbolStore => new SymbolStore({ symbols: SYMBOLS });

describe('SymbolStore.lookup', () => {
  test('returns the one record an exact name names', () => {
    const found = buildStore().lookup({ name: 'getError' });

    expect(found).toHaveLength(1);
    expect(found[0].signature).toBe('getError(): void');
  });

  test('returns every record when one name exists in two packages', () => {
    const found = buildStore().lookup({ name: 'respond' });

    expect(found.map(entry => entry.package).sort()).toEqual([
      '@venizia/ignis',
      '@venizia/ignis-kernel',
    ]);
  });

  test('filters by the short package name', () => {
    const found = buildStore().lookup({ name: 'respond', package: 'kernel' });

    expect(found).toHaveLength(1);
    expect(found[0].package).toBe('@venizia/ignis-kernel');
  });

  test('filters by the full npm package name', () => {
    const found = buildStore().lookup({ name: 'respond', package: '@venizia/ignis-kernel' });

    expect(found).toHaveLength(1);
    expect(found[0].package).toBe('@venizia/ignis-kernel');
  });

  test('returns nothing for an unknown name', () => {
    expect(buildStore().lookup({ name: 'nowhere' })).toEqual([]);
  });

  test('is case sensitive - a wrong case is not an exact hit', () => {
    expect(buildStore().lookup({ name: 'geterror' })).toEqual([]);
  });
});

describe('SymbolStore.suggest', () => {
  test('names the close candidate of a typo', () => {
    expect(buildStore().suggest({ name: 'respnd' })).toEqual(['respond']);
  });

  test('offers a substring match no prefix match covers', () => {
    expect(buildStore().suggest({ name: 'Error' })).toContain('respondError');
  });

  test('offers a case-insensitive prefix match before anything else', () => {
    expect(buildStore().suggest({ name: 'geterr' })[0]).toBe('getError');
  });

  test('never returns more than the limit', () => {
    expect(buildStore().suggest({ name: 'resp', limit: 1 })).toHaveLength(1);
  });

  test('returns nothing when no known name is close', () => {
    expect(buildStore().suggest({ name: 'zzzzzzzzzzz' })).toEqual([]);
  });
});

describe('SymbolStore with no table', () => {
  const empty = new SymbolStore({ symbols: [] });

  test('reports itself empty', () => {
    expect(empty.isEmpty()).toBe(true);
  });

  test('looks up nothing and suggests nothing', () => {
    expect(empty.lookup({ name: 'getError' })).toEqual([]);
    expect(empty.suggest({ name: 'getError' })).toEqual([]);
  });
});
