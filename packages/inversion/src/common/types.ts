/** A `T` that may also be `undefined` or `null`. */
export type TNullable<T> = T | undefined | null;

/** A `T` or a `Promise` of it, for APIs that accept sync and async results. */
export type ValueOrPromise<T> = T | Promise<T>;
/** Union of the property value types of `T`. */
export type ValueOf<T> = T[keyof T];

/** Alias of `any`, for places where the type is deliberately unchecked. */
export type AnyType = any;

/** A concrete class constructor taking any arguments and producing `T`. */
export type TConstructor<T> = new (...args: any[]) => T;
/** Like `TConstructor`, but also matches abstract classes. */
export type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
/** A `TConstructor` that also exposes static properties of any name. */
export type TClass<T> = TConstructor<T> & { [property: string]: any };

/** A function that returns `T` when called. */
export type TResolver<T> = (...args: any[]) => T;
/** A function that returns `T` or a `Promise` of `T`. */
export type TAsyncResolver<T> = (...args: any[]) => T | Promise<T>;
/** A `T` itself, or a function that returns it. */
export type TValueOrResolver<T> = T | TResolver<T>;
/** A `T` itself, or a function that returns it or a `Promise` of it. */
export type TValueOrAsyncResolver<T> = T | TAsyncResolver<T>;

/** What `@inject({ target })` names: the class, or a function returning it. The function form defers the reference to resolve time, which is how a class reached through an import cycle stays reachable. */
export type TInjectTarget = TValueOrResolver<TClass<AnyType>>;

/** `& {}` keeps the literal set but stops it widening to `string` / `number` in mutable positions; see `TConstValue` in `@venizia/ignis-helpers`. */
export type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number> & {};

/** Identifier for a binding: a string or a symbol. */
export type TBindingKey = string | symbol;

/** Free-form map of tag names to values. */
export interface IBindingTag {
  [name: string]: any;
}
