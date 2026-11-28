import { describe, expect, test } from 'bun:test';
import { SearchToggles } from '@/search/core/controllers/toggles';

const read = (toggle: unknown) =>
  SearchToggles.read({ scope: 'ProbeController', name: 'modes.raw', toggle });

describe('SearchToggles - a refusal', () => {
  test('names the option and the types, never a value', () => {
    const toggle: unknown = JSON.parse('{"use":"SECRET-use","key":"SECRET-key"}');

    expect(() => read(toggle)).toThrow(
      '[ProbeController] modes.raw must be { use: true } or { use: false } | toggle: object | use: string',
    );
    expect(() => read(toggle)).toThrow(/^(?!.*SECRET)/s);
    expect(() => read('SECRET-value')).toThrow(/^(?!.*SECRET).*toggle: string/s);
    expect(() => read(null)).toThrow('toggle: null');
  });

  test('use must be an own property of a plain object', () => {
    class Switch {
      readonly use = true;
    }

    const inherited: unknown = Object.create({ use: true });
    const list: unknown = Object.assign([], { use: true });

    for (const toggle of [inherited, list, new Switch()]) {
      expect(() => read(toggle)).toThrow('must be { use: true } or { use: false }');
    }

    expect(read(Object.assign(Object.create(null), { use: true }))).toBe(true);
    expect(read({ use: false })).toBe(false);
    expect(read(undefined)).toBe(false);
  });
});
