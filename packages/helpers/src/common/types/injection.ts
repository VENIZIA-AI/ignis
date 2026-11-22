import type { TBindingKey } from '@venizia/ignis-inversion';
import type { ValueOrPromise } from './utility';

/** Reads one value by binding `key` from the container; `T` comes from the key. */
export type TInjectionGetter = <T>(opts: { key: TBindingKey<T> }) => T;

/** Something set up by a `configure` call, which may be asynchronous. */
export interface IConfigurable<Options extends object = object, Result = unknown> {
  configure(opts?: Options): ValueOrPromise<Result>;
}
