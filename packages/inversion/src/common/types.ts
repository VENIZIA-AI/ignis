export type TNullable<T> = T | undefined | null;

export type ValueOrPromise<T> = T | Promise<T>;
export type ValueOf<T> = T[keyof T];

export type AnyType = any;

export type TConstructor<T> = new (...args: any[]) => T;
export type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
export type TClass<T> = TConstructor<T> & { [property: string]: any };

export type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;

export type TBindingKey = string | symbol;

/**
 * Tells a CONSTRUCTOR from a RESOLVER via source text - `prototype !== undefined` is true of every
 * non-arrow function. Sound only on ES2020+ output (classes emit as `class`); ES5 bundling breaks it.
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
