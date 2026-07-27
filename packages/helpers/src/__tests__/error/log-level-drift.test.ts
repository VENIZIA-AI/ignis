import { describe, expect, test } from 'bun:test';
import type { TErrorLogLevel } from '@/modules/error';
import { LogLevels } from '@/modules/logger/common';
import type { TLogLevel } from '@/modules/logger/common';

/** Resolves to `true` only while the unions are mutually assignable, to `never` on any drift. */
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

describe('error log level', () => {
  test('TErrorLogLevel and TLogLevel stay identical', () => {
    // Assigning `true` compiles only while the unions match; a drift makes the type `never`.
    const errorMatchesLog: AssertEqual<TLogLevel, TErrorLogLevel> = true;
    const logMatchesError: AssertEqual<TErrorLogLevel, TLogLevel> = true;

    expect(errorMatchesLog).toBe(true);
    expect(logMatchesError).toBe(true);
  });

  test('every TErrorLogLevel value is a valid LogLevels member', () => {
    const values: Array<TErrorLogLevel> = ['error', 'emerg', 'warn', 'info', 'debug'];

    for (const value of values) {
      expect(LogLevels.isValid(value)).toBe(true);
    }
  });
});
