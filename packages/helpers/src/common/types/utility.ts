/** `T`, `undefined` or `null`. */
export type TNullable<T> = T | undefined | null;

/** Escape hatch for a value of unknown shape; prefer a real type. */
export type AnyType = any;
/** An object with any string, number or symbol keys. */
export type AnyObject = Record<string | symbol | number, any>;

/** An options object of shape `T`; empty by default. */
export type TOptions<T extends object = {}> = T;

/** `T` or a promise of `T`; `await` it to get `T` either way. */
export type ValueOrPromise<T> = T | Promise<T>;
/** The union of the property value types of `T`. */
export type ValueOf<T> = T[keyof T];

/** `T` with the keys `K` made optional. */
export type ValueOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
/** `T` with every key optional except `K`. */
export type ValueOptionalExcept<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>;

/** Flattens an intersection of types into one object type, for readable hovers. */
export type TPrettify<T> = { [K in keyof T]: T[K] } & {};
