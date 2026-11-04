import type { ValueOrPromise } from './utility';

/** Reads one value by binding `key` from the container; the caller supplies `T`. */
export type TInjectionGetter = <T>(opts: { key: string | symbol }) => T;

/** Something set up by a `configure` call, which may be asynchronous. */
export interface IConfigurable<Options extends object = any, Result = any> {
  configure(opts?: Options): ValueOrPromise<Result>;
}
