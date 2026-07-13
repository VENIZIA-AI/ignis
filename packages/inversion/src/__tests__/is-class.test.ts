import { describe, expect, test } from 'bun:test';
import { isClass } from '@/common/types';

/**
 * `isClass` is the single predicate the whole framework uses to tell a CONSTRUCTOR from a RESOLVER:
 * the boot booters (is this export an artifact?), the controller factories and `resolveValue`
 * (`isClass(entity) ? entity : entity()`) all branch on it.
 *
 * `typeof x === 'function' && x.prototype !== undefined` is true of EVERY non-arrow function, so a
 * plain function was read as a class - a helper exported next to an artifact got bound and `new`-ed,
 * and a `function () { return User; }` resolver was returned instead of being called.
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
