import { type AnyType } from '@/common/types';
import { AbstractLogger } from './base/abstract';
import { ConsoleLogger } from './base/console';
import { LoggerDebugGate } from './common/debug-gate';
import { type ILogger, type ILoggerProvider, LogLevels, type TLogLevel } from './common/types';

/**
 * Stable wrapper the factory hands out. The delegate is resolved on the first log call or by `use()`, never at
 * construction, so no provider is touched until a line is written. The wrapper also applies the factory's level to every
 * provider the same way. Mutual reference with LoggerFactory is by design - hence the `no-use-before-define` disables.
 */
class LoggerDelegator extends AbstractLogger {
  private _delegate?: ILogger;
  private _generation = -1;

  constructor(private readonly scope: string) {
    super();
  }

  /** Takes the new provider's logger for this scope at once: the wrappers of this copy do not wait for their next line. */
  repoint(provider: ILoggerProvider): void {
    this._delegate = provider.get(this.scope);
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    this._generation = LoggerFactory.currentGeneration();
  }

  /** The provider's logger for this scope, taken again whenever any copy of the module chose another provider (one integer compare per line). */
  private delegate(): ILogger {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const generation = LoggerFactory.currentGeneration();

    if (!this._delegate || this._generation !== generation) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      this._delegate = LoggerFactory.currentProvider().get(this.scope);
      this._generation = generation;
    }

    return this._delegate;
  }

  /** The level the application set, else the shared debug gate for `debug`: a provider that has no gate of its own is gated the same way. */
  private isEnabled(level: TLogLevel): boolean {
    if (level === LogLevels.DEBUG && !LoggerDebugGate.isOpen()) {
      return false;
    }

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const threshold = LoggerFactory.currentLevel();
    return threshold === undefined || LogLevels.isEnabled({ level, threshold });
  }

  /** The one place a level method passes its line to the provider, after the one level check. */
  private forward(opts: {
    method: 'debug' | 'info' | 'warn' | 'error' | 'emerg';
    message: string;
    args: AnyType[];
  }): void {
    const { method, message, args } = opts;

    if (this.isEnabled(method)) {
      this.delegate()[method](message, ...args);
    }
  }

  debug(message: string, ...args: AnyType[]) {
    this.forward({ method: LogLevels.DEBUG, message, args });
  }

  info(message: string, ...args: AnyType[]) {
    this.forward({ method: LogLevels.INFO, message, args });
  }

  warn(message: string, ...args: AnyType[]) {
    this.forward({ method: LogLevels.WARN, message, args });
  }

  error(message: string, ...args: AnyType[]) {
    this.forward({ method: LogLevels.ERROR, message, args });
  }

  emerg(message: string, ...args: AnyType[]) {
    this.forward({ method: LogLevels.EMERG, message, args });
  }

  log(level: TLogLevel, message: string, ...args: AnyType[]) {
    if (this.isEnabled(level)) {
      this.delegate().log(level, message, ...args);
    }
  }

  for(methodName: string): ILogger {
    const childScope = this.scope !== '' ? `${this.scope}-${methodName}` : methodName;
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return LoggerFactory.getLogger([childScope]);
  }
}

/** A bundle can carry two copies of this module - the application's ESM import and core's CJS require. The chosen provider, the level and a counter of choices live in these globalThis slots so `use()` in one copy is seen, on the next line, by the loggers of the other. */
const PROVIDER_SLOT = Symbol.for('ignis:logger-provider');
const LEVEL_SLOT = Symbol.for('ignis:logger-level');
const GENERATION_SLOT = Symbol.for('ignis:logger-generation');

/**
 * The one way to get a logger, and the same everywhere: the server, a script and a browser. It names no provider: the
 * default is the console (`ConsoleLogger`), and an application chooses another with `use()`. It imports nothing from
 * node, so it is part of the browser-pure `core` entry.
 */
export class LoggerFactory {
  private static cache = new Map<string, LoggerDelegator>();

  /**
   * Choose the application's provider and/or the level. A provider re-points every wrapper issued so far. The level
   * (a `LogLevels` value the application passes) is applied by the wrapper to every provider alike, and it also
   * decides whether `debug` lines are written at all: `debug` turns the gate on, anything above it turns it off,
   * whatever the environment says. A level that is not a `LogLevels` value (a typo, an uppercase name from the
   * environment) is ignored: it must never open debug.
   */
  static use(opts: { provider?: ILoggerProvider; level?: TLogLevel }): void {
    const { provider, level } = opts;

    if (level !== undefined && LogLevels.isValid(level)) {
      Reflect.set(globalThis, LEVEL_SLOT, level);
      LoggerDebugGate.force({
        isOpen: LogLevels.isEnabled({ level: LogLevels.DEBUG, threshold: level }),
      });
    }

    if (provider === undefined) {
      return;
    }

    Reflect.set(globalThis, PROVIDER_SLOT, provider);
    this.bumpGeneration();
    for (const wrapper of this.cache.values()) {
      wrapper.repoint(provider);
    }
  }

  /** Choose `provider` only when the application has not chosen one: a framework's startup default, never an override. */
  static useUnlessChosen(opts: { provider: ILoggerProvider }): void {
    if (!this.isChosen()) {
      this.use({ provider: opts.provider });
    }
  }

  /** Whether an application (or a framework default through `useUnlessChosen`) has chosen a provider. */
  static isChosen(): boolean {
    return this.sharedProvider() !== undefined;
  }

  /** The slot is the only record of the choice, so a `use()` or a `reset()` in any copy of the module is seen by all. */
  static currentProvider(): ILoggerProvider {
    return this.sharedProvider() ?? ConsoleLogger;
  }

  /** Moves whenever a provider is chosen or reset, in any copy: a wrapper that cached its logger takes it again. */
  static currentGeneration(): number {
    const generation: number | undefined = Reflect.get(globalThis, GENERATION_SLOT);
    return generation ?? 0;
  }

  private static bumpGeneration(): void {
    Reflect.set(globalThis, GENERATION_SLOT, this.currentGeneration() + 1);
  }

  /** The level the application set, or `undefined`: then every provider applies its own gate. */
  static currentLevel(): TLogLevel | undefined {
    const level: TLogLevel | undefined = Reflect.get(globalThis, LEVEL_SLOT);
    return level;
  }

  /** The provider chosen by any copy of this module, if any. */
  private static sharedProvider(): ILoggerProvider | undefined {
    const shared: ILoggerProvider | undefined = Reflect.get(globalThis, PROVIDER_SLOT);
    return shared;
  }

  /** Back to the default provider and no level, and every wrapper takes the console again: for a test, or a host that starts over. */
  static reset(): void {
    Reflect.deleteProperty(globalThis, PROVIDER_SLOT);
    Reflect.deleteProperty(globalThis, LEVEL_SLOT);
    LoggerDebugGate.force({ isOpen: undefined });
    this.bumpGeneration();
    for (const wrapper of this.cache.values()) {
      wrapper.repoint(ConsoleLogger);
    }
  }

  static getLogger(scopes: string[]): ILogger {
    const scope = scopes.filter((part) => part.length > 0).join('-');
    let cached = this.cache.get(scope);

    if (!cached) {
      cached = new LoggerDelegator(scope);
      this.cache.set(scope, cached);
    }

    return cached;
  }
}
