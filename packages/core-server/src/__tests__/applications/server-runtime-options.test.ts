import 'reflect-metadata';

import { ServerApplication } from '@/base/applications';
import type { IServerApplicationConfigs, IServerRuntimeConfigs } from '@/base/applications';
import type { IApplicationInfo } from '@venizia/ignis-kernel';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

class RuntimeOptionsApplication extends ServerApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return {
      name: 'runtime-options-app',
      version: '0.0.0',
      description: 'Bun.serve options probe',
    };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
  override async initialize(): Promise<void> {}

  /** The protected resolver, exposed so the test reads exactly what `Bun.serve` receives. */
  readRuntimeOptions(): IServerRuntimeConfigs {
    return this.getServerRuntimeOptions();
  }
}

const buildApplication = (opts?: Partial<IServerApplicationConfigs>): RuntimeOptionsApplication => {
  return new RuntimeOptionsApplication({
    scope: RuntimeOptionsApplication.name,
    config: { path: { base: '/', isStrict: false }, ...opts },
  });
};

describe('ServerApplication - configs.server (Bun.serve options)', () => {
  test('absent: nothing is passed, so Bun keeps its own defaults', () => {
    expect(buildApplication().readRuntimeOptions()).toEqual({});
  });

  test('both keys set: both reach Bun.serve unchanged', () => {
    const application = buildApplication({
      server: { idleTimeout: 60, maxRequestBodySize: 50 * 1024 * 1024 },
    });

    expect(application.readRuntimeOptions()).toEqual({
      idleTimeout: 60,
      maxRequestBodySize: 50 * 1024 * 1024,
    });
  });

  test('one key set: the other is omitted rather than passed as undefined', () => {
    const options = buildApplication({ server: { idleTimeout: 60 } }).readRuntimeOptions();

    expect(options).toEqual({ idleTimeout: 60 });
    expect(Object.keys(options)).toEqual(['idleTimeout']);
  });

  test('a real Bun server starts with the option applied', async () => {
    const application = buildApplication({ port: 0, server: { idleTimeout: 60 } });
    application.init();

    await application.start();
    const instance = application.getServerInstance<ReturnType<typeof Bun.serve>>();

    try {
      expect(instance).toBeDefined();
      expect(instance?.port).toBeGreaterThan(0);
    } finally {
      await application.stop();
    }
  });
});
