import { CoreBindings } from '@/common/bindings';
import { Container } from '@/helpers/inversion/container';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import { applicationEnvironment, toBoolean } from '@venizia/ignis-helpers';
import isEmpty from 'lodash/isEmpty';
import type { IApplicationConfigs, IApplicationInfo } from './types';

const DEFAULT_SERVER_HOST = 'localhost';
const DEFAULT_SERVER_PORT = 3000;
const MAX_SERVER_PORT = 65535;

/** Resolves the first USABLE port among the candidates - `0` legitimately asks the OS for an ephemeral port, so candidates are rejected on validity, never falsiness. */
const resolveServerPort = (opts: { candidates: Array<number | string | undefined> }): number => {
  for (const candidate of opts.candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }

    const normalized = typeof candidate === 'string' ? candidate.trim() : candidate;
    if (normalized === '') {
      continue;
    }

    const parsed = Number(normalized);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_SERVER_PORT) {
      continue;
    }

    return parsed;
  }

  return DEFAULT_SERVER_PORT;
};

/** Container, config and lifecycle-hook plumbing shared by every IGNIS application - no router, no server. `RestApplication` adds the router; `ServerApplication` adds the listening server. */
export abstract class AbstractApplication extends Container {
  protected configs: IApplicationConfigs;
  protected projectRoot: string;

  private postStartHooks: Array<{ identifier: string; hook: () => ValueOrPromise<void> }> = [];
  private postStopHooks: Array<{ identifier: string; hook: () => ValueOrPromise<void> }> = [];

  constructor(opts: { scope: string; config: IApplicationConfigs }) {
    const { scope, config } = opts;
    super({ scope });

    this.configs = Object.assign({}, config, {
      host:
        [config.host, process.env.HOST, process.env.APP_ENV_SERVER_HOST].find(Boolean) ??
        DEFAULT_SERVER_HOST,
      port: resolveServerPort({
        candidates: [config.port, process.env.PORT, process.env.APP_ENV_SERVER_PORT],
      }),
      asyncContext: {
        enable: config?.asyncContext?.enable ?? this.getDefaultAsyncContextEnabled(),
      },
    });

    this.projectRoot = this.getProjectRoot();
    this.logger.for('constructor').info('Project root: %s', this.projectRoot);
  }

  abstract getAppInfo(): ValueOrPromise<IApplicationInfo>;
  abstract preConfigure(): ValueOrPromise<void>;
  abstract postConfigure(): ValueOrPromise<void>;

  abstract staticConfigure(): void;

  abstract setupMiddlewares(opts?: {
    middlewares?: Record<string | symbol, any>;
  }): ValueOrPromise<void>;

  abstract initialize(): Promise<void>;

  /** `false` keeps a router-only or router-less application from installing `hono/context-storage` (`node:async_hooks`); `ServerApplication` overrides this back to `true` so serving behaviour is unchanged. */
  protected getDefaultAsyncContextEnabled(): boolean {
    return false;
  }

  getProjectConfigs(): IApplicationConfigs {
    return this.configs;
  }

  getProjectRoot(): string {
    const projectRoot = process.cwd();
    this.bind<string>({ key: CoreBindings.APPLICATION_PROJECT_ROOT }).toValue(projectRoot);
    return projectRoot;
  }

  registerPostStartHook(opts: { identifier: string; hook: () => ValueOrPromise<void> }) {
    this.postStartHooks.push(opts);
    this.logger
      .for(this.registerPostStartHook.name)
      .debug('Registered post-start hook | identifier: %s', opts.identifier);
  }

  /** Runs every post-start hook in isolation - the server is already listening, so a throwing hook must not cancel the ones behind it; failures are collected and reported as one error at the end. */
  protected async executePostStartHooks() {
    if (this.postStartHooks.length === 0) {
      return;
    }

    const logger = this.logger.for(this.executePostStartHooks.name);
    logger.info('Executing %s post-start hook(s)...', this.postStartHooks.length);

    const failures: Array<{ identifier: string; error: unknown }> = [];

    for (const { identifier, hook } of this.postStartHooks) {
      const t = performance.now();

      try {
        await hook();
      } catch (error) {
        logger.error('Failed to execute hook | identifier: %s | error: %s', identifier, error);
        failures.push({ identifier, error });
        continue;
      }

      logger.info(
        'Executed hook | identifier: %s | took: %s (ms)',
        identifier,
        performance.now() - t,
      );
    }

    if (failures.length === 0) {
      return;
    }

    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: `[executePostStartHooks] Failed post-start hook(s): ${failures
        .map(failure => `${failure.identifier} (${failure.error})`)
        .join(', ')}`,
    });
  }

  registerPostStopHook(opts: { identifier: string; hook: () => ValueOrPromise<void> }) {
    this.postStopHooks.push(opts);
    this.logger
      .for(this.registerPostStopHook.name)
      .debug('Registered post-stop hook | identifier: %s', opts.identifier);
  }

  protected async executePostStopHooks() {
    const logger = this.logger.for(this.executePostStopHooks.name);
    for (const { identifier, hook } of this.postStopHooks) {
      try {
        await hook();
      } catch (error) {
        logger.error('Post-stop hook failed | identifier: %s | error: %s', identifier, error);
      }
    }
  }

  protected registerCoreBindings() {
    this.bind<typeof this>({
      key: CoreBindings.APPLICATION_INSTANCE,
    }).toProvider(_ => this);
  }

  protected validateEnvs() {
    const t = performance.now();
    const envKeys = applicationEnvironment.keys();
    this.logger
      .for(this.initialize.name)
      .info('Envs: %s | START Validating application environments...', envKeys.length);

    for (const argKey of envKeys) {
      const argValue = applicationEnvironment.get<string | number>(argKey);

      if (toBoolean(process.env.ALLOW_EMPTY_ENV_VALUE) || !isEmpty(argValue)) {
        continue;
      }

      throw getError({
        message: `[validateEnvs] Invalid Application Environment! Key: ${argKey} | Value: ${argValue}`,
      });
    }

    this.logger
      .for(this.validateEnvs.name)
      .info(
        'Envs: %s | DONE Validating application environments | Took: %s (ms)',
        envKeys.length,
        performance.now() - t,
      );
  }

  init() {
    this.registerCoreBindings();
  }
}
