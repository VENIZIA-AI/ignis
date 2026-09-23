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

/** Hands a line to the level's own method, so the logger's gates apply - `debug` checks `DEBUG`. */
const writeToLogger = (opts: {
  logger: ILogger;
  level: TLogLevel;
  message: string;
  args: Array<AnyType>;
}): void => {
  const { logger, level, message, args } = opts;

  switch (level) {
    case LogLevels.DEBUG: {
      logger.debug(message, ...args);
      break;
    }
    case LogLevels.INFO: {
      logger.info(message, ...args);
      break;
    }
    case LogLevels.WARN: {
      logger.warn(message, ...args);
      break;
    }
    case LogLevels.ERROR: {
      logger.error(message, ...args);
      break;
    }
    case LogLevels.EMERG: {
      logger.emerg(message, ...args);
      break;
    }
    default: {
      logger.log(level, message, ...args);
      break;
    }
  }
};

const NO_RESOLVER_WARNING =
  '[BaseHelper] Logging to the console - no logger provider is installed. Import `LoggerFactory` from `@venizia/ignis-helpers` at startup.';

/** Global, so a process holding both the CJS and the ESM copy of this module still warns once. */
const NO_RESOLVER_WARNED = Symbol.for('@venizia/ignis-helpers:no-logger-provider-warned');

/** Node only: a browser has no `LoggerFactory` to import, so the advice would be noise there. */
const warnNoResolverOnce = (): void => {
  if (Reflect.get(globalThis, NO_RESOLVER_WARNED) || !globalThis.process?.versions?.node) {
    return;
  }

  Reflect.set(globalThis, NO_RESOLVER_WARNED, true);
  globalThis.console.warn(NO_RESOLVER_WARNING);
};

/**
 * Writes to the console until a resolver is installed, then hands every call to the real logger - a
 * helper that logs before the resolver module loads would otherwise stay on the console for good.
 */
const createDeferredLogger = (opts: { scopes: Array<string> }): ILogger => {
  const { scopes } = opts;
  const prefix = `[${scopes.join('-')}]`;
  let resolved: ILogger | undefined;

  const write = (level: TLogLevel, message: string, args: Array<AnyType>): void => {
    const resolve = loggerSlot.resolve;
    if (!resolved && resolve) {
      resolved = resolve({ scopes });
    }

    if (resolved) {
      writeToLogger({ logger: resolved, level, message, args });
      return;
    }

    warnNoResolverOnce();
    writeToConsole({ prefix, level, message, args });
  };

  return {
    debug: (message: string, ...args: Array<AnyType>) => write(LogLevels.DEBUG, message, args),
    info: (message: string, ...args: Array<AnyType>) => write(LogLevels.INFO, message, args),
    warn: (message: string, ...args: Array<AnyType>) => write(LogLevels.WARN, message, args),
    error: (message: string, ...args: Array<AnyType>) => write(LogLevels.ERROR, message, args),
    emerg: (message: string, ...args: Array<AnyType>) => write(LogLevels.EMERG, message, args),
    log: (level: TLogLevel, message: string, ...args: Array<AnyType>) =>
      write(level, message, args),
    for: (methodName: string) =>
      resolved
        ? resolved.for(methodName)
        : createDeferredLogger({ scopes: [...scopes, methodName] }),
  };
};

/** The real logger when a resolver is installed, else one that upgrades itself the moment one is. */
export const resolveHelperLogger = (opts: { scopes: Array<string> }): ILogger => {
  const resolve = loggerSlot.resolve;
  return resolve ? resolve({ scopes: opts.scopes }) : createDeferredLogger({ scopes: opts.scopes });
};

/** Pins a logger on a helper instance: later reads are a plain property read, not its getter. */
export const pinHelperLogger = (opts: { helper: object; logger: ILogger }): void => {
  Object.defineProperty(opts.helper, 'logger', {
    value: opts.logger,
    writable: true,
    configurable: true,
    enumerable: false,
  });
};
