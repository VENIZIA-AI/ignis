import { BaseApplication } from '@/base/applications/base';
import type { AnyType } from '@venizia/ignis-helpers';
import { describe, expect, test } from 'bun:test';

class ProbeApp extends BaseApplication {
  override getProjectRoot() {
    return process.cwd();
  }
  override getAppInfo() {
    return { name: 'probe', version: '0', description: '' } as AnyType;
  }
  override staticConfigure() {}
  override preConfigure() {}
  override postConfigure() {}
  override setupMiddlewares() {}
}

describe('post-stop hooks', () => {
  test('executePostStopHooks runs every registered hook', async () => {
    const app = new ProbeApp({ scope: 'probe', config: {} as AnyType });
    const ran: string[] = [];
    app.registerPostStopHook({
      identifier: 'a',
      hook: () => {
        ran.push('a');
      },
    });
    app.registerPostStopHook({
      identifier: 'b',
      hook: () => {
        ran.push('b');
      },
    });
    await app['executePostStopHooks']();
    expect(ran).toEqual(['a', 'b']);
  });
});
