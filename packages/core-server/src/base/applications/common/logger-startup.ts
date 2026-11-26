import { LoggerFactory } from '@venizia/ignis-helpers/core';

/** What a failed `import()` reports when the package is simply not installed. */
const MODULE_NOT_FOUND_CODES = new Set(['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND']);

/**
 * What the server does about logging at startup: an application that chose a provider (`LoggerFactory.use`) keeps it;
 * one that did not gets Winston, the server's logger, when it is installed. Without Winston (an optional peer of the
 * helpers) the console stays, which is the default provider everywhere. Any other failure to load Winston (a broken
 * install, a version mismatch) is reported once on the console: the application must not log to the console in
 * production without a word.
 */
export class ServerLoggerStartup {
  static async selectDefault(): Promise<void> {
    if (LoggerFactory.isChosen()) {
      return;
    }

    try {
      const { WinstonLogger } = await import('@venizia/ignis-helpers/winston');
      LoggerFactory.useUnlessChosen({ provider: WinstonLogger });
    } catch (error) {
      const code = error instanceof Object && 'code' in error ? error.code : undefined;

      if (typeof code === 'string' && MODULE_NOT_FOUND_CODES.has(code)) {
        return;
      }

      LoggerFactory.getLogger([ServerLoggerStartup.name]).warn(
        'Winston could not be loaded, so the console stays the logger | cause: %s',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
