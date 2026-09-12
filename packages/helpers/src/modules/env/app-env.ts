import { BaseHelper } from '@/modules/base';
import { EnvironmentNames } from './names';
import { IApplicationEnvironment } from './common';

/** Adds the `NODE_ENV` reads to {@link EnvironmentNames}. Every name and set is inherited, so `Environment.PRODUCTION`, `Environment.COMMON_ENVS` and `Environment.DEVELOPMENT_ENVS` keep resolving here; only these two members need a `process`. */
export class Environment extends EnvironmentNames {
  /** `NODE_ENV` exactly as the host has it, `undefined` when unset. Destructured on purpose: `bun build` rewrites `process.env.NODE_ENV` to a literal at build time, a destructured read stays a runtime read. */
  static get ambient(): string | undefined {
    const { NODE_ENV } = process.env;
    return NODE_ENV;
  }

  static get current(): string {
    return Environment.ambient ?? Environment.DEVELOPMENT;
  }

  static is(opts: { name: string }) {
    return this.current === opts.name;
  }
}

export class ApplicationEnvironment extends BaseHelper implements IApplicationEnvironment {
  private prefix: string;
  private arguments: Record<string, any> = {};

  constructor(opts: { prefix: string; envs: Record<string, string | number | undefined> }) {
    super({ scope: ApplicationEnvironment.name });

    this.prefix = opts.prefix;

    for (const key in opts.envs) {
      if (!key.startsWith(this.prefix)) {
        continue;
      }

      this.arguments[key] = opts.envs[key];
    }
  }

  /**
   * Reads one name. A line that is present but empty - `KEY=`, or padded to `KEY=   ` by a hand
   * edit - is a pipeline that forgot to export the value, not a value: it is normalised to
   * `undefined` so `defaultValue` applies, and `transform` is handed that `undefined` rather than
   * the empty string.
   *
   * The normalisation runs ONLY when the caller supplied a `defaultValue`, because that call site
   * has already declared what it wants when the name carries nothing. A caller without one still
   * receives `''` unchanged, so no existing read changes shape. `'0'` and `'false'` are values and
   * are never normalised.
   */
  get<ReturnType, BeforeTransformType = unknown>(
    key: string,
    opts?: {
      defaultValue?: ReturnType;
      transform?: (value: BeforeTransformType) => ReturnType;
    },
  ): ReturnType {
    const raw = this.arguments[key];

    const isBlank = raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim());
    const rs = opts?.defaultValue !== undefined && isBlank ? undefined : raw;

    if (!opts?.transform) {
      return (rs ?? opts?.defaultValue) as ReturnType;
    }

    const transformed = opts.transform(rs);
    return (transformed ?? opts?.defaultValue) as ReturnType;
  }

  set<ValueType>(key: string, value: ValueType) {
    this.arguments[key] = value;
  }

  merge(opts: { envs: Record<string, string> }) {
    for (const [key, value] of Object.entries(opts.envs)) {
      this.arguments[key] = value;
    }
  }

  isDevelopment() {
    return Environment.ambient === 'development';
  }

  keys() {
    return Object.keys(this.arguments);
  }
}

/** A process can carry two copies of this module - an application's ESM import beside a CommonJS require. The instance lives in this globalThis slot so a `set()` through one copy is read through the other. */
const INSTANCE_SLOT = Symbol.for('ignis:application-environment');

const resolveApplicationEnvironment = (): ApplicationEnvironment => {
  const shared: ApplicationEnvironment | undefined = Reflect.get(globalThis, INSTANCE_SLOT);
  if (shared) {
    return shared;
  }

  const created = new ApplicationEnvironment({
    prefix: process.env.APPLICATION_ENV_PREFIX ?? 'APP_ENV',
    envs: process.env,
  });
  Reflect.set(globalThis, INSTANCE_SLOT, created);

  return created;
};

export const applicationEnvironment = resolveApplicationEnvironment();

export const AppEnvs = applicationEnvironment;
export const Envs = applicationEnvironment;
