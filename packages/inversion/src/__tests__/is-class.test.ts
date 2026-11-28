import { describe, expect, test } from 'bun:test';
import { ResolverUtility } from '@/common/utilities';

/** `ResolverUtility.isClass` tells a CONSTRUCTOR from a RESOLVER framework-wide; `prototype !== undefined` is true of every non-arrow function, so these pin the source-text check. */
describe('ResolverUtility.isClass', () => {
  test('a class declaration, an abstract class and a class expression are classes', () => {
    class Declared {}
    abstract class Abstract {}
    const Expression = class {};

    expect(ResolverUtility.isClass(Declared)).toBe(true);
    expect(ResolverUtility.isClass(Abstract)).toBe(true);
    expect(ResolverUtility.isClass(Expression)).toBe(true);
  });

  test('a subclass is a class', () => {
    class Parent {}
    class Child extends Parent {}

    expect(ResolverUtility.isClass(Child)).toBe(true);
  });

  test('a PLAIN FUNCTION is NOT a class - this is the whole point', () => {
    function plainFunction() {
      return 1;
    }

    expect(ResolverUtility.isClass(plainFunction)).toBe(false);
  });

  test('a function used as a RESOLVER is not a class, arrow or not', () => {
    class User {}

    const arrowResolver = () => User;

    function functionResolver() {
      return User;
    }

    expect(ResolverUtility.isClass(arrowResolver)).toBe(false);
    expect(ResolverUtility.isClass(functionResolver)).toBe(false);
  });

  test('non-callables are not classes', () => {
    expect(ResolverUtility.isClass({})).toBe(false);
    expect(ResolverUtility.isClass('string')).toBe(false);
    expect(ResolverUtility.isClass(1)).toBe(false);
    expect(ResolverUtility.isClass(true)).toBe(false);
    expect(ResolverUtility.isClass(null)).toBe(false);
    expect(ResolverUtility.isClass(undefined)).toBe(false);
  });
});
