import { describe, expect, test } from 'bun:test';
import {
  ScopeFilters,
  ScopeThroughBrand,
  type IModelSettings,
  type IScopeThrough,
  type TModelAccessSettings,
} from '@/index';

/** What `ScopeThrough.of` (connectors) builds: the only way to make the branded value. */
const through = <Name extends string>(relation: Name): IScopeThrough<Name> => {
  return { [ScopeThroughBrand.KEY]: true, relation };
};

describe('ScopeThroughBrand', () => {
  test('is a registered symbol, so two copies of the module agree on it', () => {
    expect(typeof ScopeThroughBrand.KEY).toBe('symbol');
    expect(Symbol.keyFor(ScopeThroughBrand.KEY)).toBe('@venizia/ignis-kernel:scope-through');
  });
});

describe('the access settings are one of two shapes', () => {
  test('a resolver, or a through, and nothing else compiles', () => {
    const resolver: TModelAccessSettings = { resolve: () => ScopeFilters.UNRESTRICTED };
    const parent: TModelAccessSettings = { through: through('product'), onMissing: 'deny' };
    const settings: IModelSettings = { access: parent };

    // @ts-expect-error - a hand-written object is not the branded value
    const handWritten: TModelAccessSettings = { through: { relation: 'product' } };
    // @ts-expect-error - a model declares a resolver or a through, not both
    const both: TModelAccessSettings = { resolve: () => null, through: through('product') };
    // @ts-expect-error - a model declares one of them
    const neither: TModelAccessSettings = { onMissing: 'deny' };
    // @ts-expect-error - the write guard options belong to a resolver
    const withColumns: TModelAccessSettings = { through: through('product'), columns: ['id'] };

    expect(typeof resolver).toBe('object');
    expect(settings.access).toBe(parent);
    expect([handWritten, both, neither, withColumns]).toHaveLength(4);
  });

  test('a through setting is told apart from a resolver setting by its through key', () => {
    const settings: TModelAccessSettings = { through: through('product') };

    if (settings.through) {
      expect(settings.through.relation).toBe('product');
    } else {
      throw new Error('expected a through setting');
    }
  });
});
