import { IApplicationEnvironment } from './types';

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
