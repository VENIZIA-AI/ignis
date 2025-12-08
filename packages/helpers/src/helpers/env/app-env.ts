import { IApplicationEnvironment } from './types';

export class Environment {
  static readonly LOCAL = 'local';
  static readonly DEBUG = 'debug';

  static readonly DEVELOPMENT = 'development';

  static readonly ALPHA = 'alpha';
  static readonly BETA = 'beta';
  static readonly STAGING = 'staging';

  static readonly PRODUCTION = 'production';

  static COMMON_ENVS = new Set([
    this.LOCAL,
    this.DEBUG,
    this.DEVELOPMENT,
    this.ALPHA,
    this.BETA,
    this.STAGING,
    this.PRODUCTION,
  ]);

  static get current(): string {
    return process.env.NODE_ENV || Environment.DEVELOPMENT;
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

  get<ReturnType>(key: string): ReturnType {
    return this.arguments[key] as ReturnType;
  }

  set<ValueType>(key: string, value: ValueType) {
    this.arguments[key] = value;
  }

  isDevelopment() {
    return process.env.NODE_ENV === 'development';
  }

  keys() {
    return Object.keys(this.arguments);
  }
}

export const applicationEnvironment = new ApplicationEnvironment({
  prefix: process.env.APPLICATION_ENV_PREFIX ?? 'APP_ENV',
  envs: process.env,
});
