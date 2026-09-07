import type { TClass } from './types';

/** Tells a CONSTRUCTOR from a RESOLVER via source text - `prototype !== undefined` is true of every non-arrow function. Sound only on ES2020+ output (classes emit as `class`); ES5 bundling breaks it. */
export const isClass = <T>(target: any): target is TClass<T> => {
  if (typeof target !== 'function' || target.prototype === undefined) {
    return false;
  }

  return /^class[\s{]/.test(Function.prototype.toString.call(target));
};
