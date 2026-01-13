import { TConstValue } from '../types';

// ------------------------------------------------------------------------------
export class Defaults {
  static readonly APPLICATION_NAME = process.env.APP_ENV_APPLICATION_NAME ?? 'APP';

  static readonly QUERY_LIMIT = 50;
  static readonly QUERY_OFFSET = 0;
}

// ------------------------------------------------------------------------------
export class RuntimeModules {
  static readonly NODE = 'node';
  static readonly BUN = 'bun';

  /**
   * Detects the current runtime environment.
   * @returns 'bun' if running in Bun, 'node' otherwise
   */
  static detect(): TRuntimeModule {
    if (typeof Bun !== 'undefined') {
      return RuntimeModules.BUN;
    }
    return RuntimeModules.NODE;
  }

  /**
   * Checks if currently running in Bun runtime.
   */
  static isBun(): boolean {
    return RuntimeModules.detect() === RuntimeModules.BUN;
  }

  /**
   * Checks if currently running in Node.js runtime.
   */
  static isNode(): boolean {
    return RuntimeModules.detect() === RuntimeModules.NODE;
  }
}
export type TRuntimeModule = TConstValue<typeof RuntimeModules>;

// ------------------------------------------------------------------------------
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
