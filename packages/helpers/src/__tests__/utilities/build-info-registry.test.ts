import { BuildInfoRegistry } from '@/utilities/build-info.utility';
import { afterEach, describe, expect, test } from 'bun:test';

describe('BuildInfoRegistry', () => {
  afterEach(() => {
    BuildInfoRegistry.clear();
  });

  test('no application registered a stamp: the reader gets undefined, never a throw', () => {
    expect(BuildInfoRegistry.get()).toBeUndefined();
  });

  test('what an entrypoint sets is what every later reader sees', () => {
    BuildInfoRegistry.set({ buildInfo: { service: 'sale', commit: 'abc123' } });

    expect(BuildInfoRegistry.get()).toEqual({ service: 'sale', commit: 'abc123' });
  });

  /**
   * The reason the slot is a `Symbol.for` on `globalThis` rather than a module-level field: a
   * process (or a compiled bundle) can carry two copies of this package, and a stamp set through
   * one copy must be found by the other.
   */
  test('the stamp lives in a globally registered slot, not in module state', () => {
    BuildInfoRegistry.set({ buildInfo: { commit: 'shared' } });

    expect(Reflect.get(globalThis, Symbol.for('ignis:build-info'))).toEqual({ commit: 'shared' });
  });

  test('a later set replaces the whole stamp rather than merging into it', () => {
    BuildInfoRegistry.set({ buildInfo: { service: 'first', commit: 'aaa' } });
    BuildInfoRegistry.set({ buildInfo: { service: 'second' } });

    expect(BuildInfoRegistry.get()).toEqual({ service: 'second' });
  });
});
