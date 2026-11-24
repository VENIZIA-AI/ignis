// `TNullable`, `ValueOrPromise` and `ValueOf` live in inversion, the lowest layer. One declaration, re-exported here so
// every `@venizia/ignis-helpers/common` import keeps working.
export type { TNullable, ValueOf, ValueOrPromise } from '@venizia/ignis-inversion';

/** An options object of shape `T`; empty by default. */
export type TOptions<T extends object = {}> = T;

/** `T` with the keys `K` made optional. */
export type ValueOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
/** `T` with every key optional except `K`. */
export type ValueOptionalExcept<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>;

/** Flattens an intersection of types into one object type, for readable hovers. */
export type TPrettify<T> = { [K in keyof T]: T[K] } & {};
