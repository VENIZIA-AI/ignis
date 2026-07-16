import { IApplicationEnvironment } from './types';

export class Environment {
  static readonly LOCAL = 'local';
  static readonly DEBUG = 'debug';

  static readonly DEVELOPMENT = 'development';
  /** The abbreviation deployments actually write. The same environment as {@link DEVELOPMENT}. */
  static readonly DEV = 'dev';
  static readonly SIT = 'sit';

  static readonly UAT = 'uat';
  static readonly ALPHA = 'alpha';
  static readonly BETA = 'beta';
  static readonly STAGING = 'staging';

  static readonly PRODUCTION = 'production';

  static COMMON_ENVS = new Set([
    this.LOCAL,
    this.DEBUG,
    this.DEVELOPMENT,
    this.DEV,
    this.SIT,
    this.UAT,
    this.ALPHA,
    this.BETA,
    this.STAGING,
    this.PRODUCTION,
  ]);

  /**
   * The environments whose users are our own engineers - the only ones an error response may reach
   * carrying a stack trace, a SQL constraint name or a raw driver message. Everything absent from
   * this set, INCLUDING an unrecognized name, is sanitized as production.
   */
  static DEVELOPMENT_ENVS = new Set([this.LOCAL, this.DEBUG, this.DEVELOPMENT, this.DEV, this.SIT]);

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

export const Envs = applicationEnvironment;
