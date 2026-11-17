import { DuckTypingUtility } from '@/common/internal';
import { describe, expect, test } from 'bun:test';

describe('DuckTypingUtility.hasMembers', () => {
  const members = { run: 'function', protocol: 'string', size: 'number' } as const;

  test('is true when every member has the stated typeof', () => {
    const value = { run: () => 1, protocol: 'file:', size: 3 };

    expect(DuckTypingUtility.hasMembers({ value, members })).toBe(true);
  });

  test('reads a member inherited through the prototype', () => {
    class Client {
      run() {}
    }
    const value = Object.assign(new Client(), { protocol: 'file:', size: 0 });

    expect(DuckTypingUtility.hasMembers({ value, members })).toBe(true);
  });

  test('is false when a member is missing or has another typeof', () => {
    expect(
      DuckTypingUtility.hasMembers({ value: { run: () => 1, protocol: 'file:' }, members }),
    ).toBe(false);
    expect(
      DuckTypingUtility.hasMembers({
        value: { run: 'nope', protocol: 'file:', size: 3 },
        members,
      }),
    ).toBe(false);
  });

  test('is false for null, undefined and primitives instead of throwing', () => {
    for (const value of [null, undefined, 'text', 7, true]) {
      expect(DuckTypingUtility.hasMembers({ value, members })).toBe(false);
    }
  });

  test('accepts a function value that carries the members', () => {
    const value = Object.assign(() => 1, { run: () => 1, protocol: 'x', size: 1 });

    expect(DuckTypingUtility.hasMembers({ value, members })).toBe(true);
  });
});

describe('DuckTypingUtility.getMethod', () => {
  test('returns the method bound to its owner', () => {
    const owner = {
      label: 'pool',
      name() {
        return this.label;
      },
    };

    const method = DuckTypingUtility.getMethod({ value: owner, name: 'name' });

    expect(method?.()).toBe('pool');
  });

  test('passes its arguments through', () => {
    const owner = { add: (left: number, right: number) => left + right };

    expect(DuckTypingUtility.getMethod({ value: owner, name: 'add' })?.(2, 3)).toBe(5);
  });

  test('is undefined for a non-function member, a missing member, null and primitives', () => {
    expect(DuckTypingUtility.getMethod({ value: { end: 1 }, name: 'end' })).toBeUndefined();
    expect(DuckTypingUtility.getMethod({ value: {}, name: 'end' })).toBeUndefined();
    expect(DuckTypingUtility.getMethod({ value: null, name: 'end' })).toBeUndefined();
    expect(DuckTypingUtility.getMethod({ value: undefined, name: 'end' })).toBeUndefined();
    expect(DuckTypingUtility.getMethod({ value: 'text', name: 'end' })).toBeUndefined();
  });
});
