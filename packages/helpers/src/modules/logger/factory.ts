import { AnyType } from '@/common/types';
import { getError } from '@venizia/ignis-inversion';
import { createRequire } from 'node:module';
import { AbstractLogger } from './base/abstract';
import { ILogger, ILoggerProvider, TLogLevel } from './common/types';
import { LoggerResolver } from './resolver';

/** Stable wrapper the factory hands out; the delegate resolves lazily (first log call or `use()`), never at construction, so no provider loads until needed. Mutual reference with LoggerFactory is by design - hence the `no-use-before-define` disables. */
class LoggerDelegator extends AbstractLogger {
  private _delegate?: ILogger;

  constructor(private readonly scope: string) {
    super();
  }

  repoint(provider: ILoggerProvider): void {
    this._delegate = provider.get(this.scope);
  }

  private delegate(): ILogger {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return (this._delegate ??= LoggerFactory.currentProvider().get(this.scope));
  }

  debug(message: string, ...args: AnyType[]) {
    this.delegate().debug(message, ...args);
  }

  info(message: string, ...args: AnyType[]) {
    this.delegate().info(message, ...args);
  }

  warn(message: string, ...args: AnyType[]) {
    this.delegate().warn(message, ...args);
  }

  error(message: string, ...args: AnyType[]) {
    this.delegate().error(message, ...args);
  }

  emerg(message: string, ...args: AnyType[]) {
    this.delegate().emerg(message, ...args);
  }

  log(level: TLogLevel, message: string, ...args: AnyType[]) {
    this.delegate().log(level, message, ...args);
  }

  for(methodName: string): ILogger {
    const childScope = this.scope !== '' ? `${this.scope}-${methodName}` : methodName;
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return LoggerFactory.getLogger([childScope]);
  }
}

/** Provider-agnostic acquisition path. Exactly ONE provider is ever loaded - the one registered via `use()`, or the winston default at first unregistered log call. */
export class LoggerFactory {
  private static provider?: ILoggerProvider;
  private static cache = new Map<string, LoggerDelegator>();

  /** Register the application's provider. Re-points every wrapper issued so far. */
  static use(opts: { provider: ILoggerProvider }): void {
    this.provider = opts.provider;
    for (const wrapper of this.cache.values()) {
      wrapper.repoint(opts.provider);
    }
  }

  static currentProvider(): ILoggerProvider {
    return (this.provider ??= this.loadDefaultProvider());
  }

  // winston is an optional peer; compiled binaries must register a provider explicitly because only a class reference carries a provider into a bundle.
  private static loadDefaultProvider(): ILoggerProvider {
    try {
      return createRequire(__filename)('./winston').WinstonLogger;
    } catch (error) {
      throw getError({
        message: [
          '[LoggerFactory] No logger provider is registered and the default (winston) could not be loaded.',
          'Either install it: `bun add winston winston-transport winston-daily-rotate-file`,',
          'or register a provider at your entrypoint: `LoggerFactory.use({ provider })` with a class',
          "from '@venizia/ignis-helpers/winston' or '@venizia/ignis-helpers/pino'.",
          'Compiled binaries (bun build --compile) MUST register explicitly.',
          `Cause: ${error instanceof Error ? error.message : String(error)}`,
        ].join(' '),
      });
    }
  }

  static getLogger(scopes: string[]): ILogger {
    const scope = scopes.join('-');
    let cached = this.cache.get(scope);

    if (!cached) {
      cached = new LoggerDelegator(scope);
      this.cache.set(scope, cached);
    }

    return cached;
  }
}

/** Provider-following facade: always resolves through the registered provider. */
export const ApplicationLogger = {
  get: (scope: string): ILogger => LoggerFactory.getLogger([scope]),
};

// Runs whenever LoggerFactory is imported as a value - which core's Container and every application entrypoint already do. This is what makes BaseHelper resolve real loggers on the server while its own import graph stays browser-pure.
LoggerResolver.use({ resolver: opts => LoggerFactory.getLogger(opts.scopes) });
