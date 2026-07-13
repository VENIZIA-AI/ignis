export type TNullable<T> = T | undefined | null;

export type ValueOrPromise<T> = T | Promise<T>;
export type ValueOf<T> = T[keyof T];

export type TConstructor<T> = new (...args: any[]) => T;
export type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
export type TClass<T> = TConstructor<T> & { [property: string]: any };

export type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;

export type TBindingKey = string | symbol;

/**
 * The single predicate that tells a CONSTRUCTOR from a RESOLVER. Everything downstream branches on
 * it: the boot booters (is this export an artifact?), the controller factories and `resolveValue`
 * (`isClass(entity) ? entity : entity()`).
 *
 * `typeof x === 'function' && x.prototype !== undefined` is not enough - it is true of EVERY
 * non-arrow function, so a helper exported next to an artifact got bound and `new`-ed, and a
 * `function () { return User; }` resolver was returned instead of being called.
 *
 * The source check is sound because the whole toolchain targets ES2024: a class is emitted as
 * `class`, never as an ES5 constructor function. A consumer bundling this package down to ES5 would
 * break the predicate.
 */
export const isClass = <T>(target: any): target is TClass<T> => {
  if (typeof target !== 'function' || target.prototype === undefined) {
    return false;
  }

  return /^class[\s{]/.test(Function.prototype.toString.call(target));
};

export interface IBindingTag {
  [name: string]: any;
}
