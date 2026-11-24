import type { TNullable } from '@/common/types';

/** Options of `get` that run a `transform` over the raw value; `defaultValue` applies when the value is absent or the transform answers null or undefined. */
export interface IApplicationEnvironmentTransformOptions<R> {
  transform: (raw: string | undefined) => R;
  defaultValue?: R;
}

/** A `transform` that may answer null or undefined, with the `defaultValue` that then applies: the read answers `R`. */
export interface IApplicationEnvironmentDefaultedTransformOptions<R> {
  transform: (raw: string | undefined) => TNullable<R>;
  defaultValue: R;
}

/** Read and write contract of the application environment store. Every value is a string: `get` answers the raw string (or `undefined`), the `defaultValue` of a string read, or what a `transform` makes of the raw string. */
export interface IApplicationEnvironment {
  get(key: string): string | undefined;
  get(key: string, opts: { defaultValue: string }): string;
  get<R>(key: string, opts: IApplicationEnvironmentDefaultedTransformOptions<R>): R;
  // oxlint-disable-next-line typescript/unified-signatures -- one union parameter infers `R` from the transform alone (`number | undefined`); two overloads let the `defaultValue` fix `R`
  get<R>(key: string, opts: IApplicationEnvironmentTransformOptions<R>): R;
  getRequired(key: string): string;
  getRequired<R>(key: string, opts: { transform: (raw: string) => TNullable<R> }): R;
  set(key: string, value: string | undefined): void;
}
