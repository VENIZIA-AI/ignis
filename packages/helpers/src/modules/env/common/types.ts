/** Options of `get` that run a `transform` over the raw value; `defaultValue` applies when the value is absent or the transform answers null or undefined. */
export interface IApplicationEnvironmentTransformOptions<R> {
  transform: (raw: string | undefined) => R;
  defaultValue?: R;
}

/** Read and write contract of the application environment store. Every value is a string: `get` answers the raw string (or `undefined`), the `defaultValue` of a string read, or what a `transform` makes of the raw string. */
export interface IApplicationEnvironment {
  get(key: string): string | undefined;
  get(key: string, opts: { defaultValue: string }): string;
  get<R>(key: string, opts: IApplicationEnvironmentTransformOptions<R>): R;
  set(key: string, value: string | undefined): void;
}
