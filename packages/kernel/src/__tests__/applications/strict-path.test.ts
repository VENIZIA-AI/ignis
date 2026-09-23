import { RestApplication } from '@/base/applications/rest';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/common';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

class StrictPathApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'strict-path-app', version: '0.0.0', description: '' };
  }
  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
}

/** Mounts the root router the way both hosts do, then answers one request. */
const requestStatus = async (opts: { config: IApplicationConfigs; path: string }) => {
  const application = new StrictPathApplication({
    scope: StrictPathApplication.name,
    config: opts.config,
  });

  const rootRouter = application.getRootRouter();
  rootRouter.get('/', context => context.text('root'));
  rootRouter.get('/users', context => context.text('users'));
  application.getServer().route(opts.config.path.base, rootRouter);

  const response = await application.getServer().request(opts.path);
  return response.status;
};

describe('RestApplication - trailing-slash strictness', () => {
  test('path.isStrict: false answers the trailing-slash variant of the base and of a route', async () => {
    const config = { path: { base: '/api', isStrict: false } };

    expect(await requestStatus({ config, path: '/api/' })).toBe(200);
    expect(await requestStatus({ config, path: '/api/users/' })).toBe(200);
  });

  test('path.isStrict: true keeps the trailing-slash variant a different route', async () => {
    const config = { path: { base: '/api', isStrict: true } };

    expect(await requestStatus({ config, path: '/api' })).toBe(200);
    expect(await requestStatus({ config, path: '/api/users' })).toBe(200);
    expect(await requestStatus({ config, path: '/api/users/' })).toBe(404);
  });

  test('a config that still carries the removed strictPath is refused, naming path.isStrict', () => {
    const config = { path: { base: '/api', isStrict: true }, strictPath: false };

    expect(() => new StrictPathApplication({ scope: StrictPathApplication.name, config })).toThrow(
      '[StrictPathApplication] configs.strictPath was removed | value: false | Use configs.path.isStrict',
    );
  });

  test('a config without path.isStrict stays strict', async () => {
    const config: IApplicationConfigs = JSON.parse('{"path":{"base":"/api"}}');

    expect(await requestStatus({ config, path: '/api/users/' })).toBe(404);
  });
});
