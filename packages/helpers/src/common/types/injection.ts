import type { ValueOrPromise } from './utility';

export type TInjectionGetter = <T>(opts: { key: string | symbol }) => T;

export interface IConfigurable<Options extends object = any, Result = any> {
  configure(opts?: Options): ValueOrPromise<Result>;
}
