import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/types';
import { ControllerTransports } from '@/base/controllers/common/constants';
import { api } from '@/base/metadata';
import { AppErrorMiddleware } from '@/base/middlewares';
import { HealthCheckComponent } from '@/components/health-check';
import { HealthCheckBindingKeys, type IHealthCheckOptions } from '@/components/health-check/common';
import { HealthCheckController } from '@/components/health-check/controller';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers';
import { beforeAll, describe, expect, test } from 'bun:test';

/** Applies a method decorator with the legacy call shape `tsc` emits for every consumer app: bun does not resolve the `extends` chain carrying `experimentalDecorators`, so decorator SYNTAX inside this package compiles with TC39 semantics, the decorators reject that shape, and the route is silently dropped. */
const applyMethodDecorator = (opts: {
  decorator: AnyType;
  target: object;
  methodName: string;
}): void => {
  const { decorator, target, methodName } = opts;
  const descriptor = Object.getOwnPropertyDescriptor(target, methodName);
  decorator(target, methodName, descriptor);
};

const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

class TestApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'test-app', version: '0.0.0', description: 'Health check test app' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

/** Re-applies `@api pingPong` with the legacy call shape: bun compiles the controller's decorator syntax with TC39 semantics, which the decorator rejects, so the PING route would otherwise be missing from the registry in this runtime only. */
beforeAll(() => {
  const definitions = new HealthCheckController({
    scope: HealthCheckController.name,
    path: '/health',
  }).definitions;

  applyMethodDecorator({
    decorator: api({ configs: definitions['PING'] }),
    target: HealthCheckController.prototype,
    methodName: 'pingPong',
  });
});

/** Boots an application with the HealthCheckComponent, optionally with a partial options binding. */
const bootHealthApplication = async (opts?: {
  options?: Partial<IHealthCheckOptions>;
}): Promise<OpenAPIHono> => {
  const application = new TestApplication({ scope: 'HealthCheckTestApp', config: TEST_CONFIGS });
  application.init();

  if (opts?.options) {
    application
      .bind<IHealthCheckOptions>({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS })
      .toValue(opts.options as IHealthCheckOptions);
  }

  const component = new HealthCheckComponent(application);
  await component.configure();
  await application['registerControllers']();

  const server = application.getServer() as OpenAPIHono;
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  server.route(TEST_CONFIGS.path.base, application.getRootRouter());
  return server;
};

describe('HealthCheckComponent — routes', () => {
  test('GET /health returns a stable { status } shape', async () => {
    const router = await bootHealthApplication();

    const response = await router.request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('POST /health/ping echoes the message back as a PONG', async () => {
    const router = await bootHealthApplication();

    const response = await router.request('/health/ping', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, AnyType>;
    expect(body.type).toBe('PONG');
    expect(body.message).toBe('hello');
    expect(typeof body.date).toBe('string');
  });

  test('POST /health/ping rejects a missing message with a validation error', async () => {
    const router = await bootHealthApplication();

    const response = await router.request('/health/ping', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(422);
  });

  test('custom rest path is honoured', async () => {
    const router = await bootHealthApplication({ options: { restOptions: { path: '/healthz' } } });

    const response = await router.request('/healthz');
    expect(response.status).toBe(200);
  });
});

describe('HealthCheckComponent — options resilience', () => {
  test('an empty options binding falls back to the default path instead of crashing at boot', async () => {
    const router = await bootHealthApplication({ options: {} });

    const response = await router.request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('a partial restOptions binding falls back to the default path instead of crashing at boot', async () => {
    const router = await bootHealthApplication({ options: { restOptions: {} as AnyType } });

    const response = await router.request('/health');
    expect(response.status).toBe(200);
  });
});
