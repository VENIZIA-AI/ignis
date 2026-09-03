/**
 * The environment names IGNIS recognizes, plus the two sets built from them. Pure by construction -
 * no `process`, no filesystem - so the browser-pure tiers can read {@link DEVELOPMENT_ENVS} without
 * pulling in a Node global. {@link Environment} extends this and adds the `NODE_ENV` reads.
 */
export class EnvironmentNames {
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

  /** Environments whose users are our own engineers - the only ones an error response may carry a stack trace or raw driver message. Anything else, including an unrecognized name, is sanitized as production. */
  static DEVELOPMENT_ENVS = new Set([this.LOCAL, this.DEBUG, this.DEVELOPMENT, this.DEV, this.SIT]);
}
