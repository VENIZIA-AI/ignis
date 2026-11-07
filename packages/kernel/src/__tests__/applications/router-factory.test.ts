import { RestApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications';
import { RouterFactories } from '@/base/applications/router-factory';
import { AbstractRestController } from '@/base/controllers/rest/abstract';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Hono } from 'hono';

class RouterApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'router-app', version: '0.0.0', description: 'Router factory probe' };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
  override async initialize(): Promise<void> {}
}

const buildConfigs = (opts?: { isStrict?: boolean }): IApplicationConfigs => {
  return { path: { base: '/', isStrict: opts?.isStrict ?? false } };
};

/** What loading the REST controller module does, restored after a test that cleared it. */
const registerOpenApi = (): void => {
  RouterFactories.registerOpenApi({ factory: ({ strict }) => new OpenAPIHono({ strict }) });
};

describe('RestApplication routers', () => {
  beforeEach(() => {
    RouterFactories.reset();
  });

  afterEach(() => {
    registerOpenApi();
  });

  test('are plain Hono, not OpenAPIHono, while the OpenAPI layer is not loaded', () => {
    const application = new RouterApplication({ scope: 'plain', config: buildConfigs() });

    expect(application.getServer()).toBeInstanceOf(Hono);
    expect(application.getServer()).not.toBeInstanceOf(OpenAPIHono);
    expect(application.getRootRouter()).not.toBeInstanceOf(OpenAPIHono);
    expect(application.getRootRouter()).not.toBe(application.getServer());
  });

  test('are OpenAPIHono once the OpenAPI layer registered itself', () => {
    registerOpenApi();

    const application = new RouterApplication({ scope: 'openapi', config: buildConfigs() });

    expect(application.getServer()).toBeInstanceOf(OpenAPIHono);
    expect(application.getRootRouter()).toBeInstanceOf(OpenAPIHono);
  });

  test('serve a mounted OpenAPIHono controller router through the plain root', async () => {
    const application = new RouterApplication({ scope: 'mount', config: buildConfigs() });
    const child = new OpenAPIHono();
    child.get('/ping', (context) => context.text('pong'));

    application.getServer().route('/api', child);
    const response = await application.getServer().request('/api/ping');

    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toBe('pong');
  });

  for (const isStrict of [true, false]) {
    test(`pass isStrict=${isStrict} to the router, plain or OpenAPI`, async () => {
      for (const withOpenApi of [false, true]) {
        RouterFactories.reset();

        if (withOpenApi) {
          registerOpenApi();
        }

        const application = new RouterApplication({
          scope: 'strict',
          config: buildConfigs({ isStrict }),
        });
        application.getServer().get('/path', (context) => context.text('ok'));
        const response = await application.getServer().request('/path/');

        expect(response.status, `withOpenApi=${withOpenApi}`).toBe(isStrict ? 404 : 200);
      }
    });
  }
});

describe('the REST controller module', () => {
  // A fresh process: in this one, an earlier import already registered the layer and a test above restores it.
  test('registers the OpenAPI layer as it loads, and not before', () => {
    const probe = join(import.meta.dir, 'fixtures/router-registration.probe.ts');
    const run = Bun.spawnSync({ cmd: ['bun', probe], cwd: process.cwd(), stderr: 'pipe' });

    expect(run.exitCode, run.stderr.toString()).toBe(0);
    expect(JSON.parse(run.stdout.toString())).toEqual({ before: false, after: true });
  });

  test('leaves a program that loaded it with OpenAPIHono routers', () => {
    // `AbstractRestController` is imported at the top of this file, so the layer is registered here.
    expect(AbstractRestController).toBeDefined();
    expect(RouterFactories.isOpenApiRegistered()).toBe(true);

    const application = new RouterApplication({ scope: 'loaded', config: buildConfigs() });

    expect(application.getServer()).toBeInstanceOf(OpenAPIHono);
    expect(application.getRootRouter()).toBeInstanceOf(OpenAPIHono);
  });
});
