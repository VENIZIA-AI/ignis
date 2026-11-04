import { describe, expect, test } from 'bun:test';
import {
  ScopeFilters,
  ScopeThrough,
  type IModelSettings,
  type TModelAccessSettings,
} from '@/index';

/** What `ModelFactory.defineEntity` builds, reduced to the part `ScopeThrough.of` reads. */
const VariantBase = {
  relationDefinitions: { product: { type: 'one' }, siblings: { type: 'many' } },
} as const;

describe('ScopeThrough.of', () => {
  test('takes the name of a one relation of the entity, and nothing else', () => {
    const through = ScopeThrough.of({ entity: VariantBase, relation: 'product' });
    const name: string = 'product';

    // @ts-expect-error - a misspelled relation does not compile
    ScopeThrough.of({ entity: VariantBase, relation: 'prodcut' });
    // @ts-expect-error - a to-many relation does not compile
    ScopeThrough.of({ entity: VariantBase, relation: 'siblings' });
    // @ts-expect-error - a name held in a plain string does not compile
    ScopeThrough.of({ entity: VariantBase, relation: name });

    expect(through.relation).toBe('product');
  });

  test('is the only way to make the value: a hand-written object does not compile', () => {
    // @ts-expect-error - the constructor is private
    const constructed = new ScopeThrough('product');
    // @ts-expect-error - a plain object lacks the member that makes the class nominal
    const handWritten: ScopeThrough = { relation: 'product' };

    expect(constructed.relation).toBe('product');
    expect(handWritten.relation).toBe('product');
  });
});

describe('the access settings are one of two shapes', () => {
  const through = ScopeThrough.of({ entity: VariantBase, relation: 'product' });

  test('a resolver, or a through, and nothing else compiles', () => {
    const resolver: TModelAccessSettings = { resolve: () => ScopeFilters.UNRESTRICTED };
    const parent: TModelAccessSettings = { through };
    const settings: IModelSettings = { access: parent };

    // @ts-expect-error - a model declares a resolver or a through, not both
    const both: TModelAccessSettings = { resolve: () => null, through };
    // @ts-expect-error - a model declares one of them
    const neither: TModelAccessSettings = {};
    // @ts-expect-error - the write guard options belong to a resolver
    const withColumns: TModelAccessSettings = { through, columns: ['id'] };
    // @ts-expect-error - a parent that resolves no scope always denies, so there is no onMissing to choose
    const withOnMissing: TModelAccessSettings = { through, onMissing: 'allow' };

    expect(typeof resolver).toBe('object');
    expect(settings.access).toBe(parent);
    expect([both, neither, withColumns, withOnMissing]).toHaveLength(4);
  });

  test('a through setting is told apart from a resolver setting by its through key', () => {
    const settings: TModelAccessSettings = { through };

    if (settings.through) {
      expect(settings.through.relation).toBe('product');
    } else {
      throw new Error('expected a through setting');
    }
  });
});
