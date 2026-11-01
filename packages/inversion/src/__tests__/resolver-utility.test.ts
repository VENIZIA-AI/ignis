import { describe, expect, test } from 'bun:test';
import { ResolverUtility } from '@/common/utilities';

class Target {}

describe('ResolverUtility.resolveValue', () => {
  test('a plain value is returned as it is', () => {
    expect(ResolverUtility.resolveValue({ value: 5 })).toBe(5);
  });

  test('a plain function is called', () => {
    expect(ResolverUtility.resolveValue({ value: () => 'called' })).toBe('called');
  });

  test('a class is a value, never a factory', () => {
    expect(ResolverUtility.resolveValue({ value: Target })).toBe(Target);
  });
});

describe('ResolverUtility.resolveValueAsync', () => {
  test('a resolver that answers a promise is awaited', async () => {
    const result = await ResolverUtility.resolveValueAsync({ value: async () => 7 });
    expect(result).toBe(7);
  });

  test('a value and a class pass through', async () => {
    const result2 = await ResolverUtility.resolveValueAsync({ value: 'x' });
    expect(result2).toBe('x');
    const result3 = await ResolverUtility.resolveValueAsync({ value: Target });
    expect(result3).toBe(Target);
  });
});

describe('ResolverUtility.resolveInjectTarget', () => {
  test('a class is answered as it is, and a function is called here', () => {
    expect(ResolverUtility.resolveInjectTarget({ target: Target })).toBe(Target);
    expect(ResolverUtility.resolveInjectTarget({ target: () => Target })).toBe(Target);
  });

  test('a function that hands back something that is not a class answers undefined', () => {
    expect(
      ResolverUtility.resolveInjectTarget({ target: (() => 'nope') as unknown as () => never }),
    ).toBeUndefined();
  });
});
