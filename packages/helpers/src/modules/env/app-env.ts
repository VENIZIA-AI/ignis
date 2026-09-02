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

  get<ReturnType, BeforeTransformType = unknown>(
    key: string,
    opts?: {
      defaultValue?: ReturnType;
      transform?: (value: BeforeTransformType) => ReturnType;
    },
  ): ReturnType {
    const rs = this.arguments[key];

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

export const applicationEnvironment = new ApplicationEnvironment({
  prefix: process.env.APPLICATION_ENV_PREFIX ?? 'APP_ENV',
  envs: process.env,
});

export const AppEnvs = applicationEnvironment;
export const Envs = applicationEnvironment;
