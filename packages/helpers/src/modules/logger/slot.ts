import type { AnyType } from '@/common/types';
import { LogLevels } from './common/types';
import type { ILogger, TLogLevel } from './common/types';

export type TLoggerResolver = (opts: { scopes: Array<string> }) => ILogger;

/**
 * Where the logger module installs its resolver, and the only reference `BaseHelper` holds to it.
 *
 * A slot rather than an import: `BaseHelper` sits under every class in the framework, so importing
 * the resolver put 1033 B gzipped into every browser bundle that touched any helper.
 */
export const loggerSlot: { resolve?: TLoggerResolver } = {};

/** Writes one line to the console; `emerg` and anything unrecognised land on `error`. */
const writeToConsole = (opts: {
  prefix: string;
  level: TLogLevel;
  message: string;
  args: Array<AnyType>;
}): void => {
  const { prefix, level, message, args } = opts;
  const line = `${prefix} ${message}`;

  switch (level) {
    case LogLevels.DEBUG: {
      globalThis.console.debug(line, ...args);
      break;
    }
    case LogLevels.INFO: {
      globalThis.console.info(line, ...args);
      break;
    }
    case LogLevels.WARN: {
      globalThis.console.warn(line, ...args);
      break;
    }
    default: {
      globalThis.console.error(line, ...args);
      break;
    }
  }
};

/** What a helper logs through when nothing installed a resolver: the console, tagged with its scope. */
export const consoleFallbackLogger = (opts: { scopes: Array<string> }): ILogger => {
  const { scopes } = opts;
  const prefix = `[${scopes.filter(scope => scope && scope.length > 0).join('-')}]`;

  return {
    debug: (message: string, ...args: Array<AnyType>) =>
      writeToConsole({ prefix, level: LogLevels.DEBUG, message, args }),
    info: (message: string, ...args: Array<AnyType>) =>
      writeToConsole({ prefix, level: LogLevels.INFO, message, args }),
    warn: (message: string, ...args: Array<AnyType>) =>
      writeToConsole({ prefix, level: LogLevels.WARN, message, args }),
    error: (message: string, ...args: Array<AnyType>) =>
      writeToConsole({ prefix, level: LogLevels.ERROR, message, args }),
    emerg: (message: string, ...args: Array<AnyType>) =>
      writeToConsole({ prefix, level: LogLevels.EMERG, message, args }),
    log: (level: TLogLevel, message: string, ...args: Array<AnyType>) =>
      writeToConsole({ prefix, level, message, args }),
    for: (methodName: string) => consoleFallbackLogger({ scopes: [...scopes, methodName] }),
  };
};

/** One logger per helper. A `WeakMap`, not a field: a mixin's anonymous class cannot emit a private member (TS4094). */
const loggerByHelper = new WeakMap<object, ILogger>();

/** Resolves a helper's logger on first read and caches it. */
export const resolveHelperLogger = (opts: { helper: object; scopes: Array<string> }): ILogger => {
  const { helper, scopes } = opts;

  const cached = loggerByHelper.get(helper);
  if (cached) {
    return cached;
  }

  const resolved = (loggerSlot.resolve ?? consoleFallbackLogger)({ scopes });
  loggerByHelper.set(helper, resolved);
  return resolved;
};

export const setHelperLogger = (opts: { helper: object; logger: ILogger }): void => {
  loggerByHelper.set(opts.helper, opts.logger);
};
