export type TNullable<T> = T | undefined | null;

export type ValueOrPromise<T> = T | Promise<T>;
export type ValueOf<T> = T[keyof T];

export type AnyType = any;

export type TConstructor<T> = new (...args: any[]) => T;
export type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
export type TClass<T> = TConstructor<T> & { [property: string]: any };

export type TResolver<T> = (...args: any[]) => T;
export type TAsyncResolver<T> = (...args: any[]) => T | Promise<T>;
export type TValueOrResolver<T> = T | TResolver<T>;
export type TValueOrAsyncResolver<T> = T | TAsyncResolver<T>;

/** What `@inject({ target })` names: the class, or a function returning it. The function form defers the reference to resolve time, which is how a class reached through an import cycle stays reachable. */
export type TInjectTarget = TValueOrResolver<TClass<AnyType>>;

export type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;

export type TBindingKey = string | symbol;

export interface IBindingTag {
  [name: string]: any;
}
