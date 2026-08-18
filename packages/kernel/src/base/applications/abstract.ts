import { CoreBindings } from '@/common/bindings';
import { Container } from '@/helpers/inversion/container';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { IApplicationConfigs, IApplicationInfo } from './types';

export abstract class AbstractApplication extends Container {
  protected configs: IApplicationConfigs;
  protected projectRoot: string;

  private postStartHooks: Array<{ identifier: string; hook: () => ValueOrPromise<void> }> = [];
  private postStopHooks: Array<{ identifier: string; hook: () => ValueOrPromise<void> }> = [];

  constructor(opts: { scope: string; config: IApplicationConfigs }) {
    const { scope, config } = opts;
    super({ scope });

    this.configs = Object.assign({}, config, {
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

  protected getDefaultAsyncContextEnabled(): boolean {
    return false;
  }

  getProjectConfigs(): IApplicationConfigs {
    return this.configs;
  }

  getProjectRoot(): string {
    const projectRoot = '';
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

  init() {
    this.registerCoreBindings();
  }
}
