import { describe, expect, test } from 'bun:test';
import { ToggleUtility } from '../../utilities';
import type { TToggle } from '../../utilities';

type TOptions = { limit: number; label: string };

describe('ToggleUtility', () => {
  test('isUsed is false for an absent toggle', () => {
    expect(ToggleUtility.isUsed<TOptions>(undefined)).toBe(false);
  });

  test('isUsed is false for { use: false }', () => {
    const toggle: TToggle<TOptions> = { use: false };

    expect(ToggleUtility.isUsed(toggle)).toBe(false);
  });

  test('isUsed narrows a toggle that is on so its options are reachable', () => {
    const toggle: TToggle<TOptions> = { use: true, limit: 3, label: 'a' };

    if (!ToggleUtility.isUsed(toggle)) {
      throw new Error('expected the toggle to be on');
    }

    expect(toggle.limit).toBe(3);
    expect(toggle.label).toBe('a');
  });

  test('pick is undefined when the toggle is off or absent', () => {
    const off: TToggle<TOptions> = { use: false };

    expect(ToggleUtility.pick(off)).toBeUndefined();
    expect(ToggleUtility.pick<TOptions>(undefined)).toBeUndefined();
  });

  test('pick returns the options without use when the toggle is on', () => {
    const toggle: TToggle<TOptions> = { use: true, limit: 3, label: 'a' };

    expect(ToggleUtility.pick(toggle)).toEqual({ limit: 3, label: 'a' });
  });

  test('pick of a bare { use: true } is an empty object', () => {
    const toggle: TToggle = { use: true };

    expect(ToggleUtility.pick(toggle)).toEqual({});
  });
});
