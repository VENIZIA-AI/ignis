import { EnvironmentNames } from '@/modules/env/names';

type TEnvironment = Record<string, string | undefined>;

/**
 * The rule that decides whether `debug` lines are written: off unless `DEBUG` is truthy and the environment is allowed
 * (`NODE_ENV` unset, or one of the common names, or one `APP_ENV_EXTRA_LOG_ENVS` adds). Every provider shares it, so a
 * console, a winston and a pino logger agree.
 *
 * Pure: it takes the environment as an argument and reads `process` only through a guarded `globalThis` read, because a
 * browser has none and there the default is off. `LoggerFactory.use({ level })` overrides it.
 */
export class LoggerDebugGate {
  /** The override lives on globalThis, so `use({ level })` in one copy of the module opens or closes debug in the other. */
  private static readonly FORCED_SLOT = Symbol.for('ignis:logger-debug-forced');
  private static resolved?: boolean;

  /** The environment the host has, `{}` where there is no `process`. */
  static readEnvironment(): TEnvironment {
    return globalThis.process?.env ?? {};
  }

  /**
   * The truthiness `ParseUtility.toBoolean` has, repeated here on purpose: `ParseUtility` imports the error module, and
   * this file is in the graph of `BaseHelper`, which must stay a few hundred bytes in a browser bundle.
   */
  private static isTruthy(opts: { input: string | undefined }): boolean {
    const { input } = opts;
    return input !== undefined && input !== '' && input !== 'false' && input !== '0';
  }

  /** The rule itself, for any environment: a pure function of `env`. */
  static evaluate(opts: { env: TEnvironment }): boolean {
    const { env } = opts;
    const { DEBUG, NODE_ENV, APP_ENV_EXTRA_LOG_ENVS } = env;
    const extra = (APP_ENV_EXTRA_LOG_ENVS ?? '').split(',').map((name) => name.trim());
    const allowed = new Set([...Array.from(EnvironmentNames.COMMON_ENVS), ...extra]);

    return this.isTruthy({ input: DEBUG }) && (!NODE_ENV || allowed.has(NODE_ENV));
  }

  /** Whether `debug` is written now: the override when `use` set one, else the rule on the host's environment, read once. */
  static isOpen(): boolean {
    const forced: boolean | undefined = Reflect.get(globalThis, this.FORCED_SLOT);
    if (forced !== undefined) {
      return forced;
    }

    this.resolved ??= this.evaluate({ env: this.readEnvironment() });
    return this.resolved;
  }

  /** `LoggerFactory.use({ level })` calls it: an explicit level turns debug on or off whatever the environment says. */
  static force(opts: { isOpen: boolean | undefined }): void {
    if (opts.isOpen === undefined) {
      Reflect.deleteProperty(globalThis, this.FORCED_SLOT);
      return;
    }

    Reflect.set(globalThis, this.FORCED_SLOT, opts.isOpen);
  }
}
