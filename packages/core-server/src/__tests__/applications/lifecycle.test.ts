import 'reflect-metadata';

import { BaseApplication, ServerBootSteps } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications';
import { BindingNamespaces } from '@venizia/ignis-kernel';
import { RequestTrackerComponent } from '@/components';
import { BindingKeys, BindingScopes } from '@venizia/ignis-kernel';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { RuntimeModules } from '@venizia/ignis-helpers/common';
import { DatasourceBooter } from '@venizia/ignis-boot';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

/** Records the invocation order of the seven traced lifecycle steps so their relative order is asserted as a whole rather than step by step. Does not cover the full 13-step `getBootSequence()` contract - see `BaseApplication - getBootSequence()` below for that. */
class TraceApplication extends BaseApplication {
  readonly trace: string[] = [];

  /** `bun test` transpiles without legacy parameter decorators, so RequestTrackerComponent's `@inject`ed application never reaches the container - rebound to an explicit instance. */
  override async registerDefaultMiddlewares(): Promise<void> {
    await super.registerDefaultMiddlewares();

    this.bind({
      key: BindingKeys.build({
        namespace: BindingNamespaces.COMPONENT,
        key: RequestTrackerComponent.name,
      }),
    })
      .toValue(new RequestTrackerComponent(this))
      .setScope(BindingScopes.SINGLETON);
  }

  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'trace-app', version: '0.0.0', description: 'Lifecycle trace app' };
  }

  staticConfigure(): void {
    this.trace.push('staticConfigure');
  }

  preConfigure(): void {
    this.trace.push('preConfigure');
  }

  override async registerDataSources(): Promise<void> {
    this.trace.push('registerDataSources');
    await super.registerDataSources();
  }

  override async registerComponents(): Promise<void> {
    this.trace.push('registerComponents');
    await super.registerComponents();
  }

  override async registerControllers(): Promise<void> {
    this.trace.push('registerControllers');
    await super.registerControllers();
  }

  postConfigure(): void {
    this.trace.push('postConfigure');
  }

  setupMiddlewares(): void {
    this.trace.push('setupMiddlewares');
  }
}

const buildConfigs = (opts?: Partial<IApplicationConfigs>): IApplicationConfigs => {
  return {
    host: '127.0.0.1',
    port: 0,
    path: { base: '/', isStrict: false },
    ...opts,
  };
};

describe('BaseApplication - lifecycle order', () => {
  let application: TraceApplication | undefined;

  afterEach(async () => {
    await application?.stop();
    application = undefined;
  });

  test('the 7 traced steps run in order, exactly once each', async () => {
    application = new TraceApplication({ scope: 'TraceApplication', config: buildConfigs() });
    application.init();

    const hooked: string[] = [];
    application.registerPostStartHook({
      identifier: 'trace-hook',
      hook: () => {
        hooked.push('executePostStartHooks');
      },
    });

    await application.start();

    expect(application.trace).toEqual([
      'staticConfigure',
      'preConfigure',
      'registerDataSources',
      'registerComponents',
      'registerControllers',
      'postConfigure',
      'setupMiddlewares',
    ]);
    expect(hooked).toEqual(['executePostStartHooks']);
  });

  test('a throwing lifecycle step aborts start() and leaves NO server listening', async () => {
    class BrokenApplication extends TraceApplication {
      override preConfigure(): void {
        throw getError({ message: 'preConfigure exploded' });
      }
    }

    application = new BrokenApplication({ scope: 'BrokenApplication', config: buildConfigs() });
    application.init();

    const startResult = await application.start().catch((error: unknown) => error);

    expect(String(startResult)).toContain('preConfigure exploded');
    expect(application.getServerInstance()).toBeUndefined();
    expect(application.trace).toEqual(['staticConfigure']);
  });
});

describe('BaseApplication - getBootSequence()', () => {
  test('ServerBootSteps validates every name the sequence uses, kernel ones included', () => {
    const application = new TraceApplication({
      scope: 'BootStepsApplication',
      config: buildConfigs(),
    });

    const stepNames = application['getBootSequence']().map(step => step.name);

    expect(ServerBootSteps.SCHEME_SET.size).toBe(14);
    expect(stepNames.every(name => ServerBootSteps.isValid(name))).toBe(true);
    expect(ServerBootSteps.isValid('not-a-step')).toBe(false);
  });

  test('composes the documented 14-step order: kernel base + core-server splices, in order', () => {
    const application = new TraceApplication({
      scope: 'BootSequenceApplication',
      config: buildConfigs(),
    });

    const stepNames = application['getBootSequence']().map(step => step.name);

    expect(stepNames).toEqual([
      'printStartUpInfo',
      'validateEnvs',
      'registerDefaultMiddlewares',
      'staticConfigure',
      'registerArtifacts',
      'preConfigure',
      'hydrateSecrets',
      'registerDataSources',
      'registerComponents',
      'registerContributedDataSources',
      'wireSecretRotatables',
      'registerControllers',
      'postConfigure',
      'validateScopeFilterSupport',
    ]);
  });

  /** The name list above cannot tell a live `run` from an emptied one, so this subclass traces the two core-server-only steps no lifecycle hook already covers. */
  class StepBodyApplication extends TraceApplication {
    protected override validateEnvs(): void {
      this.trace.push('validateEnvs');
      super.validateEnvs();
    }

    protected override validateScopeFilterSupport(): void {
      this.trace.push('validateScopeFilterSupport');
      super.validateScopeFilterSupport();
    }
  }

  test('initialize() RUNS validateEnvs first and validateScopeFilterSupport last, around the traced hooks', async () => {
    const application = new StepBodyApplication({
      scope: 'StepBodyApplication',
      config: buildConfigs(),
    });
    application.init();

    await application.initialize();

    expect(application.trace).toEqual([
      'validateEnvs',
      'staticConfigure',
      'preConfigure',
      'registerDataSources',
      'registerComponents',
      'registerControllers',
      'postConfigure',
      'validateScopeFilterSupport',
    ]);
  });
});

describe('BaseApplication - booter() collision guard', () => {
  test('allowOverride: false throws on a genuine collision, matching the other five registration methods', () => {
    const application = new TraceApplication({
      scope: 'BooterApplication',
      config: buildConfigs(),
    });

    application.booter(DatasourceBooter);

    expect(() => application.booter(DatasourceBooter, { allowOverride: false })).toThrow(
      `[booter] Binding key already registered: '${BindingNamespaces.BOOTERS}.${DatasourceBooter.name}'`,
    );
  });

  test('registering the same booter twice does not throw by default (matches historical overwrite behavior)', () => {
    const application = new TraceApplication({
      scope: 'BooterApplication',
      config: buildConfigs(),
    });

    expect(() => application.booter(DatasourceBooter)).not.toThrow();
    expect(() => application.booter(DatasourceBooter)).not.toThrow();
  });
});

describe('BaseApplication - post-start hooks', () => {
  let application: TraceApplication | undefined;

  afterEach(async () => {
    await application?.stop();
    application = undefined;
  });

  test('one throwing hook does NOT skip the remaining hooks, and start() still reports it', async () => {
    application = new TraceApplication({ scope: 'HookApplication', config: buildConfigs() });
    application.init();

    const executed: string[] = [];
    application.registerPostStartHook({
      identifier: 'first',
      hook: () => {
        executed.push('first');
      },
    });
    application.registerPostStartHook({
      identifier: 'exploding',
      hook: () => {
        throw getError({ message: 'hook exploded' });
      },
    });
    application.registerPostStartHook({
      identifier: 'third',
      hook: async () => {
        await Promise.resolve();
        executed.push('third');
      },
    });

    const startResult = await application.start().catch((error: unknown) => error);

    expect(executed).toEqual(['first', 'third']);
    expect(startResult).toBeInstanceOf(Error);
    expect(String(startResult)).toContain('exploding');
    expect(application.getServerInstance()).toBeDefined();
  });
});

describe('BaseApplication - stop()', () => {
  test('node runtime: stop() awaits the callback-based close() instead of resolving early', async () => {
    const application = new TraceApplication({
      scope: 'StopApplication',
      config: buildConfigs(),
    });

    let isClosed = false;
    const nodeInstance = {
      close: (callback: (error?: Error) => void) => {
        setTimeout(() => {
          isClosed = true;
          callback();
        }, 10);
      },
    };

    application['runtime'] = RuntimeModules.NODE;
    application['serverInstance'] = nodeInstance;

    await application.stop();

    expect(isClosed).toBe(true);
    expect(application.getServerInstance()).toBeUndefined();
  });

  test('node runtime: a close() failure rejects stop() instead of being swallowed', async () => {
    const application = new TraceApplication({
      scope: 'StopApplication',
      config: buildConfigs(),
    });

    application['runtime'] = RuntimeModules.NODE;
    application['serverInstance'] = {
      close: (callback: (error?: Error) => void) => {
        callback(getError({ message: 'server was not running' }));
      },
    };

    const stopResult = await application.stop().catch((error: unknown) => error);
    expect(String(stopResult)).toContain('server was not running');
  });

  test('stop() on a never-started application is a no-op', async () => {
    const application = new TraceApplication({
      scope: 'StopApplication',
      config: buildConfigs(),
    });

    await application.stop();
    expect(application.getServerInstance()).toBeUndefined();
  });
});

describe('BaseApplication - server port resolution', () => {
  let application: TraceApplication | undefined;
  const originalPort = process.env.PORT;
  const originalAppEnvPort = process.env.APP_ENV_SERVER_PORT;

  beforeEach(() => {
    delete process.env.PORT;
    delete process.env.APP_ENV_SERVER_PORT;
  });

  afterEach(async () => {
    await application?.stop();
    application = undefined;

    process.env.PORT = originalPort;
    process.env.APP_ENV_SERVER_PORT = originalAppEnvPort;
    if (originalPort === undefined) {
      delete process.env.PORT;
    }
    if (originalAppEnvPort === undefined) {
      delete process.env.APP_ENV_SERVER_PORT;
    }
  });

  test('config port 0 ("ask the OS") is honoured, not replaced by the 3000 default', () => {
    application = new TraceApplication({ scope: 'PortApplication', config: buildConfigs() });
    expect(application.getServerPort()).toBe(0);
  });

  test('PORT=0 from the environment is honoured, not replaced by the 3000 default', () => {
    process.env.PORT = '0';
    application = new TraceApplication({
      scope: 'PortApplication',
      config: buildConfigs({ port: undefined }),
    });
    expect(application.getServerPort()).toBe(0);
  });

  test('a NaN config port (Number(undefined)) falls through to the env, then to the default', () => {
    application = new TraceApplication({
      scope: 'PortApplication',
      config: buildConfigs({ port: Number(undefined) }),
    });
    expect(application.getServerPort()).toBe(3000);

    process.env.APP_ENV_SERVER_PORT = '4567';
    const withEnv = new TraceApplication({
      scope: 'PortApplication',
      config: buildConfigs({ port: Number(undefined) }),
    });
    expect(withEnv.getServerPort()).toBe(4567);
  });

  test('a non-numeric env port is ignored rather than collapsing to 0', () => {
    process.env.PORT = 'not-a-port';
    application = new TraceApplication({
      scope: 'PortApplication',
      config: buildConfigs({ port: undefined }),
    });
    expect(application.getServerPort()).toBe(3000);
  });

  // One variable per case above never exercises the fallback between them: an unusable PORT must
  // not shadow a usable APP_ENV_SERVER_PORT.
  test('an invalid PORT falls through to a valid APP_ENV_SERVER_PORT', () => {
    process.env.PORT = 'abc';
    process.env.APP_ENV_SERVER_PORT = '8080';

    application = new TraceApplication({
      scope: 'PortApplication',
      config: buildConfigs({ port: undefined }),
    });

    expect(application.getServerPort()).toBe(8080);
  });

  // Docker's legacy container links export PORT as a full URL. It is truthy, it is not a port, and
  // it is the everyday shape of this bug in production.
  test('the Docker legacy-link PORT form falls through to APP_ENV_SERVER_PORT', () => {
    process.env.PORT = 'tcp://172.17.0.5:8080';
    process.env.APP_ENV_SERVER_PORT = '8080';

    application = new TraceApplication({
      scope: 'PortApplication',
      config: buildConfigs({ port: undefined }),
    });

    expect(application.getServerPort()).toBe(8080);
  });

  test('a valid PORT still wins over APP_ENV_SERVER_PORT', () => {
    process.env.PORT = '5001';
    process.env.APP_ENV_SERVER_PORT = '8080';

    application = new TraceApplication({
      scope: 'PortApplication',
      config: buildConfigs({ port: undefined }),
    });

    expect(application.getServerPort()).toBe(5001);
  });

  test('two unusable env ports fall through to the default', () => {
    process.env.PORT = 'abc';
    process.env.APP_ENV_SERVER_PORT = '99999';

    application = new TraceApplication({
      scope: 'PortApplication',
      config: buildConfigs({ port: undefined }),
    });

    expect(application.getServerPort()).toBe(3000);
  });

  test('after starting on port 0, getServerPort() reports the OS-assigned port', async () => {
    application = new TraceApplication({ scope: 'PortApplication', config: buildConfigs() });
    application.init();
    await application.start();

    const port = application.getServerPort();
    expect(port).toBeGreaterThan(0);
    expect(port).not.toBe(3000);
    expect(application.getServerAddress()).toBe(`127.0.0.1:${port}`);

    const response = await fetch(`http://127.0.0.1:${port}/favicon.ico`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
  });
});
