export type TNullable<T> = T | undefined | null;

export type ValueOrPromise<T> = T | Promise<T>;
export type ValueOf<T> = T[keyof T];

export type AnyType = any;

export type TConstructor<T> = new (...args: any[]) => T;
export type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
export type TClass<T> = TConstructor<T> & { [property: string]: any };

export type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;

export type TBindingKey = string | symbol;

export interface IBindingTag {
  [name: string]: any;
}
