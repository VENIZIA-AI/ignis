import { ParseUtility } from '@/utilities/parse.utility';
import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import { EnvironmentNames } from './names';
import {
  type IApplicationEnvironment,
  type IApplicationEnvironmentDefaultedTransformOptions,
  type IApplicationEnvironmentTransformOptions,
} from './common';
import type { TNullable } from '@/common/types';

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

/** Key-value store of the environment entries whose key starts with `prefix`; other keys are dropped at construction. `get` applies a default and an optional transform. Use the shared `applicationEnvironment` instance rather than constructing one. */
export class ApplicationEnvironment extends BaseHelper implements IApplicationEnvironment {
  private prefix: string;
  private arguments: Record<string, string | undefined> = Object.create(null);

  constructor(opts: { prefix: string; envs: Record<string, string | undefined> }) {
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
  get(key: string): string | undefined;
  get(key: string, opts: { defaultValue: string }): string;
  /** A transform that may answer nothing, with the `defaultValue` that then applies: the `defaultValue` fixes `R`. */
  get<R>(key: string, opts: IApplicationEnvironmentDefaultedTransformOptions<R>): R;
  /** What the transform makes of the raw string: `R` is inferred from the transform. */
  get<R>(key: string, opts: IApplicationEnvironmentTransformOptions<R>): R;
  get<R>(
    key: string,
    opts?: {
      defaultValue?: string | R;
      transform?: (raw: string | undefined) => TNullable<R>;
    },
  ): string | R | undefined {
    const raw = this.arguments[key];

    const isBlank = raw == null || (typeof raw === 'string' && !raw.trim());
    const rs = opts?.defaultValue !== undefined && isBlank ? undefined : raw;

    if (!opts?.transform) {
      return rs ?? opts?.defaultValue;
    }

    return opts.transform(rs) ?? opts.defaultValue;
  }

  /**
   * A variable the app cannot run without: it is set and not blank (the rule `get` applies to a `defaultValue`), or this throws an error naming the key. The check runs before `transform`, so `transform` receives a `string`; a `transform` that answers null or undefined throws too. A required value has no `defaultValue`.
   */
  getRequired(key: string): string;
  getRequired<R>(key: string, opts: { transform: (raw: string) => TNullable<R> }): R;
  getRequired<R>(key: string, opts?: { transform: (raw: string) => TNullable<R> }): string | R {
    const value = this.get(key);

    if (typeof value !== 'string' || !value.trim()) {
      throw getError({ message: `[getRequired] ${key} is not set` });
    }

    if (!opts) {
      return value;
    }

    const transformed = opts.transform(value);

    if (transformed === null || transformed === undefined) {
      throw getError({ message: `[getRequired] ${key} is not valid` });
    }

    return transformed;
  }

  set(key: string, value: string | undefined): void {
    this.arguments[key] = value;
  }

  merge(opts: { envs: Record<string, string | undefined> }) {
    const envsEntries = Object.entries(opts.envs);

    for (const [key, value] of envsEntries) {
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
    prefix:
      ParseUtility.blankToUndefined({ input: process.env.APPLICATION_ENV_PREFIX }) ?? 'APP_ENV',
    envs: process.env,
  });
  Reflect.set(globalThis, INSTANCE_SLOT, created);

  return created;
};

/** The process-wide environment store, built from `process.env` with the prefix in `APPLICATION_ENV_PREFIX` (`APP_ENV` when unset). One instance is shared by every copy of this module in the process. */
export const applicationEnvironment = resolveApplicationEnvironment();

/** Alias of `applicationEnvironment`. */
export const AppEnvs = applicationEnvironment;
