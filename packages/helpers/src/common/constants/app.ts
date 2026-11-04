import { type TConstValue } from '../types';

/** Application-wide defaults: the application name and the paging values of a list query. */
export class Defaults {
  /**
   * The application name; reads `APP_ENV_APPLICATION_NAME`.
   * @default 'APP'
   */
  static readonly APPLICATION_NAME = globalThis.process?.env?.APP_ENV_APPLICATION_NAME ?? 'APP';

  /**
   * Rows a list query returns.
   * @default 50
   */
  static readonly QUERY_LIMIT = 50;
  /**
   * Rows a list query skips.
   * @default 0
   */
  static readonly QUERY_OFFSET = 0;
}

/** IGNIS runs on Bun only: `detect()` answers `'bun'` there and `undefined` anywhere else (a browser, another runtime). */
export class RuntimeModules {
  static readonly BUN = 'bun';

  static detect(): TRuntimeModule | undefined {
    return typeof Bun !== 'undefined' ? RuntimeModules.BUN : undefined;
  }

  static isBun(): boolean {
    return RuntimeModules.detect() === RuntimeModules.BUN;
  }
}
/** The runtime names `RuntimeModules` holds; only `bun` today. */
export type TRuntimeModule = TConstValue<typeof RuntimeModules>;

/** The value kinds a stored field can hold; `isValid` tests a string against them. */
export class DataTypes {
  static readonly NUMBER = 'NUMBER';
  static readonly TEXT = 'TEXT';
  static readonly BYTE = 'BYTE';
  static readonly JSON = 'JSON';
  static readonly BOOLEAN = 'BOOLEAN';

  static readonly SCHEME_SET = new Set([
    this.NUMBER,
    this.TEXT,
    this.BYTE,
    this.JSON,
    this.BOOLEAN,
  ]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}
