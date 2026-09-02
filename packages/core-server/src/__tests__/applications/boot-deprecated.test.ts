import 'reflect-metadata';

import { BaseApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

class BareApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'bare-app', version: '0.0.0', description: '' };
  }
  staticConfigure(): void {}
  preConfigure(): void {}
  postConfigure(): void {}
  setupMiddlewares(): void {}
}

const CONFIGS: IApplicationConfigs = {
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
};

describe('BaseApplication.boot() - deprecated no-op', () => {
  test('resolves an empty report and binds nothing', async () => {
    const application = new BareApplication({ scope: 'BareApplication', config: CONFIGS });

    const report = await application.boot();

    expect(report).toEqual({ booters: [], phases: [], totalDurationMs: 0 });
    expect(application.isBound({ key: 'bootstrapper' })).toBe(false);
    expect(application.findByTag({ tag: 'booter' })).toHaveLength(0);
  });

  test('booter() and registerBooters() are gone from the prototype', () => {
    const surface = Object.getOwnPropertyNames(BaseApplication.prototype);

    expect(surface).not.toContain('booter');
    expect(surface).not.toContain('registerBooters');
  });
});
