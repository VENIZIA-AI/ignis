import { EnvironmentNames } from './names';
import { IApplicationEnvironment } from './types';

/** Adds the `NODE_ENV` reads to {@link EnvironmentNames}. Every name and set is inherited, so `Environment.PRODUCTION`, `Environment.COMMON_ENVS` and `Environment.DEVELOPMENT_ENVS` keep resolving here; only these two members need a `process`. */
export class Environment extends EnvironmentNames {
  static get current(): string {
    const { NODE_ENV } = process.env;
    if (!NODE_ENV) {
      return Environment.DEVELOPMENT;
    }

    return NODE_ENV;
  }

  static is(opts: { name: string }) {
    return this.current === opts.name;
  }
}

export class ApplicationEnvironment implements IApplicationEnvironment {
  private prefix: string;
  private arguments: Record<string, any> = {};

  constructor(opts: { prefix: string; envs: Record<string, string | number | undefined> }) {
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
    const { NODE_ENV } = process.env;
    return NODE_ENV === 'development';
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
