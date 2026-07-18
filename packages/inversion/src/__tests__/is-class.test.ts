import { describe, expect, test } from 'bun:test';
import { isClass } from '@/common/types';

/**
 * `isClass` tells a CONSTRUCTOR from a RESOLVER framework-wide; `prototype !== undefined` is true
 * of every non-arrow function, so these pin the source-text check.
 */
describe('isClass', () => {
  test('a class declaration, an abstract class and a class expression are classes', () => {
    class Declared {}
    abstract class Abstract {}
    const Expression = class {};

    expect(isClass(Declared)).toBe(true);
    expect(isClass(Abstract)).toBe(true);
    expect(isClass(Expression)).toBe(true);
  });

  test('a subclass is a class', () => {
    class Parent {}
    class Child extends Parent {}

    expect(isClass(Child)).toBe(true);
  });

  test('a PLAIN FUNCTION is NOT a class - this is the whole point', () => {
    function plainFunction() {
      return 1;
    }

    expect(isClass(plainFunction)).toBe(false);
  });

  test('a function used as a RESOLVER is not a class, arrow or not', () => {
    class User {}

    const arrowResolver = () => User;
    function functionResolver() {
      return User;
    }

    expect(isClass(arrowResolver)).toBe(false);
    expect(isClass(functionResolver)).toBe(false);
  });

  test('non-callables are not classes', () => {
    expect(isClass({})).toBe(false);
    expect(isClass('string')).toBe(false);
    expect(isClass(1)).toBe(false);
    expect(isClass(true)).toBe(false);
    expect(isClass(null)).toBe(false);
    expect(isClass(undefined)).toBe(false);
  });
});
