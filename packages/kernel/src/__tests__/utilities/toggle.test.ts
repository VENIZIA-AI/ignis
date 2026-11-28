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

  test('anything but a boolean use is refused, by isUsed and by pick', () => {
    const invalid = [
      '{"use":"false"}',
      '{"use":"true"}',
      '{"use":1}',
      '{"use":0}',
      '{}',
      'null',
      'true',
      '"on"',
    ];

    for (const written of invalid) {
      expect(() => ToggleUtility.isUsed(JSON.parse(written))).toThrow('A toggle must be');
      expect(() => ToggleUtility.pick(JSON.parse(written))).toThrow('A toggle must be');
    }
  });

  test('a refused toggle never puts its values in the message', () => {
    const written = '{"use":"SECRET-use","key":"SECRET-key"}';

    expect(() => ToggleUtility.isUsed(JSON.parse(written))).toThrow(
      /^(?!.*SECRET).*A toggle must be/s,
    );
  });

  test('a refusal names the option it was given, and is a server error', () => {
    const name = '[Probe] options.feature';
    const invalid: TToggle = JSON.parse('{"use":"false"}');

    for (const read of [
      () => ToggleUtility.isUsed(invalid, { name }),
      () => ToggleUtility.pick(invalid, { name }),
    ]) {
      expect(read).toThrow(`option: ${name} |`);
      expect(read).toThrow(expect.objectContaining({ statusCode: 500 }));
    }
  });

  test('use must be an own property of a plain object', () => {
    class Switch {
      readonly use = true;
    }

    const invalid: TToggle[] = [
      Object.create({ use: true }),
      Object.assign(JSON.parse('[]'), { use: true }),
      new Switch(),
    ];

    for (const toggle of invalid) {
      expect(() => ToggleUtility.isUsed(toggle)).toThrow('A toggle must be');
    }

    const bare: TToggle = Object.assign(Object.create(null), { use: true });

    expect(ToggleUtility.isUsed(bare)).toBe(true);
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
