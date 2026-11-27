import { EnvironmentNames } from '@/modules/env/names';

type TEnvironment = Record<string, string | undefined>;

/**
 * The rule that decides whether `debug` lines are written: off unless `DEBUG` is set to something but a false word and the environment is allowed
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

  /**
   * A false word of a boolean setting, as `z.stringbool()` reads it, or a blank text; in any case, space around it
   * allowed. `ParseUtility` reads it too: it lives here because this module is in the graph of `BaseHelper`, in a
   * browser bundle with a byte ceiling. No two `\s*` meet, so a long header costs linear time.
   */
  static readonly FALSE_WORDS = /^\s*(?:(?:false|0|no|off|n|disabled)\s*)?$/i;

  /** The environment the host has, `{}` where there is no `process`. */
  static readEnvironment(): TEnvironment {
    return globalThis.process?.env ?? {};
  }

  /**
   * The rule itself, for any environment: a pure function of `env`. `DEBUG` is a namespace pattern other libraries
   * share (`app:*`), not a boolean: only a blank value or a false word turns it off, and nothing is refused.
   */
  static evaluate(opts: { env: TEnvironment }): boolean {
    const { env } = opts;
    const { DEBUG, NODE_ENV, APP_ENV_EXTRA_LOG_ENVS } = env;
    const extra = (APP_ENV_EXTRA_LOG_ENVS ?? '').split(',').map((name) => name.trim());
    const allowed = new Set([...Array.from(EnvironmentNames.COMMON_ENVS), ...extra]);

    return !this.FALSE_WORDS.test(DEBUG ?? '') && (!NODE_ENV || allowed.has(NODE_ENV));
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
