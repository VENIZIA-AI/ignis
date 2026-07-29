import { AnyType } from '@/common/types';
import { AbstractLogger } from './base/abstract';
import { ConsoleLogger } from './base/console';
import { ILogger, TLogLevel } from './common/types';

export type TLoggerResolver = (opts: { scopes: Array<string> }) => ILogger;

/** Caches the resolved target and re-reads it only when `LoggerResolver`'s generation moves - one integer compare per call, so an instance built before `LoggerFactory` loaded upgrades the moment it does, without being reconstructed. Mutual reference with LoggerResolver is by design - hence the `no-use-before-define` disables. */
class ResolvedLogger extends AbstractLogger {
  private target?: ILogger;
  private targetGeneration = -1;

  constructor(private readonly scopes: Array<string>) {
    super();
  }

  private resolveTarget(): ILogger {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const generation = LoggerResolver.currentGeneration();
    if (!this.target || this.targetGeneration !== generation) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      this.target = LoggerResolver.resolveNow({ scopes: this.scopes });
      this.targetGeneration = generation;
    }

    return this.target;
  }

  debug(message: string, ...args: AnyType[]) {
    this.resolveTarget().debug(message, ...args);
  }

  info(message: string, ...args: AnyType[]) {
    this.resolveTarget().info(message, ...args);
  }

  warn(message: string, ...args: AnyType[]) {
    this.resolveTarget().warn(message, ...args);
  }

  error(message: string, ...args: AnyType[]) {
    this.resolveTarget().error(message, ...args);
  }

  emerg(message: string, ...args: AnyType[]) {
    this.resolveTarget().emerg(message, ...args);
  }

  log(level: TLogLevel, message: string, ...args: AnyType[]) {
    this.resolveTarget().log(level, message, ...args);
  }

  for(methodName: string): ILogger {
    return new ResolvedLogger([...this.scopes, methodName]);
  }
}

/** The only logger code `BaseHelper` reaches, so this module must stay free of node imports - `BaseHelper` sits under every base class in the framework. */
export class LoggerResolver {
  /** Declared before `active` because static field initialisers run in declaration order. */
  private static readonly consoleResolver: TLoggerResolver = opts => {
    return ConsoleLogger.get({ scope: opts.scopes.filter(el => el && el.length > 0).join('-') });
  };

  private static active: TLoggerResolver = this.consoleResolver;
  private static generation = 0;

  /** `LoggerFactory` installs itself here from its own module body, so importing `LoggerFactory` as a value is what wires the real logger up - a side-effect-only import would not survive `sideEffects: false`. */
  static use(opts: { resolver: TLoggerResolver }): void {
    this.active = opts.resolver;
    this.generation += 1;
  }

  static reset(): void {
    this.active = this.consoleResolver;
    this.generation += 1;
  }

  /** Internal to this module - `ResolvedLogger` reads it to decide whether its cached target is stale. */
  static currentGeneration(): number {
    return this.generation;
  }

  /** Internal to this module - resolves through whatever is installed right now. */
  static resolveNow(opts: { scopes: Array<string> }): ILogger {
    return this.active({ scopes: opts.scopes });
  }

  static resolve(opts: { scopes: Array<string> }): ILogger {
    return new ResolvedLogger(opts.scopes);
  }
}
