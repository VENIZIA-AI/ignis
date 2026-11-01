import { LoggerFactory } from '@venizia/ignis-helpers/core';

/**
 * What the server does about logging at startup: an application that chose a provider (`LoggerFactory.use`) keeps it;
 * one that did not gets Winston, the server's logger, when it is installed. Without Winston (an optional peer of the
 * helpers) the console stays, which is the default provider everywhere.
 */
export class ServerLoggerStartup {
  static async selectDefault(): Promise<void> {
    if (LoggerFactory.isChosen()) {
      return;
    }

    try {
      const { WinstonLogger } = await import('@venizia/ignis-helpers/winston');
      LoggerFactory.useUnlessChosen({ provider: WinstonLogger });
      // eslint-disable-next-line venizia/no-silent-catch -- winston is an optional peer: without it the console, the default provider, stays
    } catch {
      return;
    }
  }
}
