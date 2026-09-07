export type TResolver<T> = (...args: any[]) => T;
export type TAsyncResolver<T> = (...args: any[]) => T | Promise<T>;
export type TValueOrResolver<T> = T | TResolver<T>;
export type TValueOrAsyncResolver<T> = T | TAsyncResolver<T>;
