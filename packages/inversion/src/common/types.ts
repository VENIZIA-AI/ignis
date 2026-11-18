/** A `T` that may also be `undefined` or `null`. */
export type TNullable<T> = T | undefined | null;

/** A `T` or a `Promise` of it, for APIs that accept sync and async results. */
export type ValueOrPromise<T> = T | Promise<T>;
/** Union of the property value types of `T`. */
export type ValueOf<T> = T[keyof T];

/** A concrete class constructor producing `T`. Its arguments are `never[]`, so any constructor fits; build an instance with `Reflect.construct`. */
export type TConstructor<T> = new (...args: never[]) => T;
/** Like `TConstructor`, but also matches abstract classes. */
export type TAbstractConstructor<T> = abstract new (...args: never[]) => T;
/** A class producing `T`. Read its static members through a type that declares them, such as `typeof MyClass`. */
export type TClass<T> = TConstructor<T>;

/** A function that returns `T` when called. */
export type TResolver<T> = (...args: never[]) => T;
/** A function that returns `T` or a `Promise` of `T`. */
export type TAsyncResolver<T> = (...args: never[]) => T | Promise<T>;
/** A `T` itself, or a function that returns it. */
export type TValueOrResolver<T> = T | TResolver<T>;
/** A `T` itself, or a function that returns it or a `Promise` of it. */
export type TValueOrAsyncResolver<T> = T | TAsyncResolver<T>;

/** What `@inject({ target })` names: the class, or a function returning it. The function form defers the reference to resolve time, which is how a class reached through an import cycle stays reachable. */
export type TInjectTarget = TValueOrResolver<TClass<unknown>>;

/** `& {}` keeps the literal set but stops it widening to `string` / `number` in mutable positions; see `TConstValue` in `@venizia/ignis-helpers`. */
export type TConstValue<T extends TClass<unknown>> = Extract<ValueOf<T>, string | number> & {};

/**
 * A binding key: a `string | symbol` branded with the type of the value bound under it (compile time only). Typed keys
 * make `bind`, `get`, `getBinding` and `gets` infer `T`; a plain key is `TBindingKey<unknown>`. Bivariant.
 */
export type TBindingKey<T = unknown> = (string | symbol) & {
  readonly valueType?: { bivarianceHack(value: T): void }['bivarianceHack'];
};

/** The value type a key names (`unknown` for a plain key): annotates an `@inject` parameter, which nothing checks. */
export type TBindingKeyValue<K> = K extends { readonly valueType?: (value: infer V) => void }
  ? V
  : unknown;

/** Free-form map of tag names to values. */
export interface IBindingTag {
  [name: string]: unknown;
}
