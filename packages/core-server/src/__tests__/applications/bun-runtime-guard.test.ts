import 'reflect-metadata';

import { BaseApplication, BunRuntimeGuard } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo, IRuntimeSnapshot } from '@/base/applications';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

const NODE: IRuntimeSnapshot = { otherName: 'node', otherVersion: 'v24.14.0' };

class GuardedApplication extends BaseApplication {
  constructor(private readonly runtimeSnapshot?: IRuntimeSnapshot) {
    super({
      scope: 'GuardedApplication',
      config: {
        host: '127.0.0.1',
        port: 0,
        path: { base: '/', isStrict: false },
      } as IApplicationConfigs,
    });
  }

  protected override getRuntimeSnapshot(): IRuntimeSnapshot {
    return this.runtimeSnapshot ?? super.getRuntimeSnapshot();
  }

  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'guarded', version: '0.0.0', description: '' };
  }
  staticConfigure(): void {}
  preConfigure(): ValueOrPromise<void> {}
  postConfigure(): ValueOrPromise<void> {}
  setupMiddlewares(): ValueOrPromise<void> {}
}

describe('BunRuntimeGuard.assert', () => {
  test('passes on the Bun that runs this suite', () => {
    expect(() => BunRuntimeGuard.assert()).not.toThrow();
  });

  test('passes on Bun 1.4.0 and on a later minor and major', () => {
    for (const bunVersion of ['1.4.0', '1.5.2', '2.0.0']) {
      expect(() => BunRuntimeGuard.assert({ runtime: { bunVersion } })).not.toThrow();
    }
  });

  test('refuses an older Bun and names it', () => {
    expect(() => BunRuntimeGuard.assert({ runtime: { bunVersion: '1.3.9' } })).toThrow(
      'IGNIS requires Bun >= 1.4 (running on bun 1.3.9)',
    );
  });

  test('refuses Node.js and names the runtime and its version', () => {
    expect(() => BunRuntimeGuard.assert({ runtime: NODE })).toThrow(
      'IGNIS requires Bun >= 1.4 (running on node v24.14.0)',
    );
  });

  test('refuses a runtime it cannot name', () => {
    expect(() => BunRuntimeGuard.assert({ runtime: {} })).toThrow(
      '(running on an unknown runtime)',
    );
  });
});

describe('ServerApplication - start()', () => {
  test('refuses on Node.js before touching a hook, a datasource or a socket', async () => {
    const application = new GuardedApplication(NODE);

    const result = await application.start().catch((error: unknown) => error);

    expect(String(result)).toContain('IGNIS requires Bun >= 1.4 (running on node v24.14.0)');
    expect(application.getServerInstance()).toBeUndefined();
  });

  test('starts and stops on Bun', async () => {
    const application = new GuardedApplication();
    application.init();

    await application.start();
    expect(application.getServerInstance()).toBeDefined();

    await application.stop();
    expect(application.getServerInstance()).toBeUndefined();
  });
});
