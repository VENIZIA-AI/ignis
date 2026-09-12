import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import { HealthCheckComponent } from '@/components/health-check';
import { HealthCheckBindingKeys, type IHealthCheckOptions } from '@/components/health-check/common';
import { HealthCheckReporter } from '@/components/health-check/reporter';
import { AppErrorMiddleware } from '@/base/middlewares';
import { notFoundHandler } from '@venizia/ignis-kernel';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { BuildInfoRegistry } from '@venizia/ignis-helpers/core';
import { ControllerTransports } from '@venizia/ignis-kernel';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { afterEach, describe, expect, test } from 'bun:test';

const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

class StatsTestApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'stats-app', version: '9.9.9', description: 'Stats probe' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}
const boot = async (opts?: {
  /** Deliberately wide: the real binding is env/config driven, so a test may hand it a wrong-typed value. */
  options?: IHealthCheckOptions | Record<string, unknown>;
  /** What `application.component(HealthCheckComponent, { options })` hands to `configure()`. */
  registrationOptions?: IHealthCheckOptions;
}): Promise<OpenAPIHono> => {
  const application = new StatsTestApplication({ scope: 'StatsApp', config: TEST_CONFIGS });
  application.init();

  if (opts?.options) {
    application.bind({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS }).toValue(opts.options);
  }

  const component = new HealthCheckComponent(application);
  // Mirrors `registerDynamicBindings`: `instance.configure(options)` with the registration entry.
  await component.configure(opts?.registrationOptions);
  await application['registerControllers']();

  const server = application.getServer();
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  // Mirrors `RestApplication.registerDefaultMiddlewares`: the refusal has to meet the real handler.
  server.notFound(notFoundHandler({ logger: application.logger }));
  server.route(TEST_CONFIGS.path.base, application.getRootRouter());
  return server;
};

afterEach(() => {
  BuildInfoRegistry.clear();
});

describe('GET /health stays public and minimal', () => {
  test('it answers status and the server clock, and names no runtime or version', async () => {
    const router = await boot();

    const response = await router.request('/health');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok', timestamp: expect.any(String) });
    // `toEqual`, not `toMatchObject`: the whole point of the split is that NOTHING else is there.
  });
});

describe('GET /health/stats is off unless a host opts in', () => {
  test('enable: false leaves the route unmounted, not merely empty', async () => {
    const router = await boot({ options: { stats: { enable: false } } });

    expect((await router.request('/health/stats')).status).toBe(404);
  });

  /**
   * `application.component(HealthCheckComponent, { options })` must reach the gate: the base
   * `configure()` only logs its argument, so a component that does not consume it documents a
   * knob that does nothing. The call site is the most explicit intent, so it outranks a key
   * bound earlier.
   */
  test('options given at registration mount the route and outrank an earlier binding', async () => {
    const fromRegistration = await boot({
      registrationOptions: { stats: { enable: true, secretKey: 'reg' } },
    });
    const refused = await fromRegistration.request('/health/stats');
    const allowed = await fromRegistration.request('/health/stats', {
      headers: { 'x-health-key': 'reg' },
    });
    expect(refused.status).toBe(404);
    expect(allowed.status).toBe(200);

    const overridden = await boot({
      options: { stats: { enable: true } },
      registrationOptions: { stats: { enable: false } },
    });
    expect((await overridden.request('/health/stats')).status).toBe(404);
  });

  /**
   * Fail-closed, like `AppErrorMiddleware.isProduction`: the default is MEMBERSHIP in
   * `DEVELOPMENT_ENVS`. The environment is injected rather than written into `process.env`, which
   * every test file in the worker shares.
   */
  test('with no explicit enable the default is closed outside the development environments', () => {
    for (const name of ['staging', 'uat', 'production', 'preprod', 'PRODUCTION']) {
      const enabled = HealthCheckReporter.isStatsEnabled({
        options: {},
        environment: () => name,
      });
      expect(enabled).toBe(false);
    }

    for (const name of ['development', 'local', 'debug', 'dev', 'sit', 'DEVELOPMENT']) {
      const enabled = HealthCheckReporter.isStatsEnabled({
        options: {},
        environment: () => name,
      });
      expect(enabled).toBe(true);
    }
  });

  /** A host that cannot prove it is a dev machine is production: `Environment.current` would mask an unset `NODE_ENV` as `development`. */
  test('an unset environment is closed, not read as development', () => {
    const enabled = HealthCheckReporter.isStatsEnabled({
      options: {},
      environment: () => undefined,
    });

    expect(enabled).toBe(false);
  });

  /** The binding is env/config driven, so `enable` arrives as a string; `"false"` is truthy and must not mount the route. */
  test('a config-derived enable that is not a boolean does not mount the route', async () => {
    const router = await boot({ options: { stats: { enable: 'false' } } });

    expect((await router.request('/health/stats')).status).toBe(404);
  });

  test('enabled: it reports build, process and memory', async () => {
    const router = await boot({ options: { stats: { enable: true } } });

    const response = await router.request('/health/stats');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      build: { service: 'stats-app', version: '9.9.9' },
      process: {
        pid: expect.any(Number),
        uptimeHuman: expect.stringMatching(/^\d+h \d+m \d+s$/),
        // Both are declared in the route's response schema; a reporter that drops one is a break.
        environment: expect.any(String),
        runtime: expect.stringMatching(/^(bun|node) \d+\.\d+\.\d+/),
      },
      memory: { rss: expect.stringMatching(/MB$/) },
    });
  });
});

describe('the stats gate', () => {
  test('a configured secretKey hides the route from a caller without the header', async () => {
    const router = await boot({ options: { stats: { enable: true, secretKey: 'shhh' } } });

    // 404, not 401: an unauthorised caller must not learn the route exists.
    expect((await router.request('/health/stats')).status).toBe(404);
  });

  test('the same route answers when the header carries the key', async () => {
    const router = await boot({ options: { stats: { enable: true, secretKey: 'shhh' } } });

    const response = await router.request('/health/stats', {
      headers: { 'x-health-key': 'shhh' },
    });

    expect(response.status).toBe(200);
  });

  test('a wrong key is refused', async () => {
    const router = await boot({ options: { stats: { enable: true, secretKey: 'shhh' } } });

    const response = await router.request('/health/stats', {
      headers: { 'x-health-key': 'guessed' },
    });

    expect(response.status).toBe(404);
  });

  /**
   * The refusal must be indistinguishable from a route that was never mounted, otherwise the 404
   * itself confirms the endpoint exists. A thrown `ApplicationError` serializes a DIFFERENT body
   * than the application's notFound handler, so the two shapes are compared, not just the status.
   */
  test('a refused request is byte-identical to an unmounted route', async () => {
    const gated = await boot({ options: { stats: { enable: true, secretKey: 'shhh' } } });
    const unmounted = await boot({ options: { stats: { enable: false } } });

    const refused = await gated.request('/health/stats', {
      headers: { 'x-health-key': 'guessed' },
    });
    const absent = await unmounted.request('/health/stats');

    expect(refused.status).toBe(absent.status);
    // `requestId` and `path` differ per request; the KEY SET and the message are what would leak.
    const shapeOf = (body: unknown): { keys: string[]; message: unknown } => {
      const record = Object(body);
      return { keys: Object.keys(record).sort(), message: record.message };
    };
    expect(shapeOf(await refused.json())).toEqual(shapeOf(await absent.json()));
  });

  /**
   * Unit-level on purpose: an HTTP stack strips whitespace from a header value, so a blank key can
   * only be exercised where the comparison happens. The wrong-typed keys come through `JSON.parse`
   * because that is literally how a config-driven binding delivers them.
   */
  test('a key that is not a non-blank string fails closed even when the caller carries it', () => {
    const blank: IHealthCheckOptions = JSON.parse('{"stats":{"enable":true,"secretKey":"   "}}');
    const empty: IHealthCheckOptions = JSON.parse('{"stats":{"enable":true,"secretKey":""}}');
    const nulled: IHealthCheckOptions = JSON.parse('{"stats":{"enable":true,"secretKey":null}}');
    const numeric: IHealthCheckOptions = JSON.parse('{"stats":{"enable":true,"secretKey":42}}');

    for (const options of [blank, empty, nulled, numeric]) {
      expect(HealthCheckReporter.isStatsAuthorized({ options, header: '   ' })).toBe(false);
      expect(HealthCheckReporter.isStatsAuthorized({ options, header: undefined })).toBe(false);
    }

    // The guard refuses bad configuration, not every request: a real key still authorises.
    const real: IHealthCheckOptions = { stats: { enable: true, secretKey: 'shhh' } };
    expect(HealthCheckReporter.isStatsAuthorized({ options: real, header: 'shhh' })).toBe(true);
    expect(HealthCheckReporter.isStatsAuthorized({ options: real, header: 'guessed' })).toBe(false);
  });

  /**
   * IGNIS runs nested applications in one process. The gate therefore has to be per-container: a
   * static field on the controller would let the last application to boot decide for every one
   * before it, publishing A's stats under B's options.
   */
  test('two applications in one process keep their own gate', async () => {
    const locked = await boot({ options: { stats: { enable: true, secretKey: 'shhh' } } });
    const open = await boot({ options: { stats: { enable: true } } });

    expect((await locked.request('/health/stats')).status).toBe(404);
    expect((await open.request('/health/stats')).status).toBe(200);
  });
});

describe('the build stamp resolves without reading a file or spawning git', () => {
  test('the registry stamp is reported when an application registered one', async () => {
    BuildInfoRegistry.set({
      buildInfo: { commit: 'abc123def456', branch: 'develop', builtAt: '2026-09-11T00:00:00.000Z' },
    });

    const router = await boot({ options: { stats: { enable: true } } });
    const body = await (await router.request('/health/stats')).json();

    // `version` is not in the stamp, so it still falls through to getAppInfo().
    expect(body).toMatchObject({
      build: { commit: 'abc123def456', branch: 'develop', version: '9.9.9' },
    });
  });

  /**
   * The slot is a process-wide `globalThis` entry any dependency can write, and `IBuildInfo` types
   * it without checking. A non-string must not reach the response, whose schema declares
   * `z.string()` - an object there would serialize straight into the body.
   */
  test('a stamp field that is not a string falls through instead of being reported', async () => {
    // Written straight into the slot, the way an unvetted dependency would - no typed API in the way.
    Reflect.set(globalThis, Symbol.for('ignis:build-info'), {
      service: { apiKey: 'leaked' },
      commit: 42,
    });

    const router = await boot({ options: { stats: { enable: true } } });
    const body = await (await router.request('/health/stats')).json();

    expect(body).toMatchObject({ build: { service: 'stats-app', commit: 'unspecified' } });
  });

  test('explicit options win over the registry', async () => {
    BuildInfoRegistry.set({ buildInfo: { commit: 'from-registry' } });

    const router = await boot({
      options: { stats: { enable: true, buildInfo: { commit: 'from-options' } } },
    });
    const body = await (await router.request('/health/stats')).json();

    expect(body).toMatchObject({ build: { commit: 'from-options' } });
  });

  /** A host that ran no generator must still be diagnosable, not blank. */
  test('with no stamp at all it reports the app info and marks the rest unspecified', async () => {
    const router = await boot({ options: { stats: { enable: true } } });
    const body = await (await router.request('/health/stats')).json();

    expect(body).toMatchObject({
      build: {
        service: 'stats-app',
        version: '9.9.9',
        commit: 'unspecified',
        builtAt: 'unspecified',
      },
    });
  });
});

describe('HealthCheckReporter.toHumanUptime', () => {
  test('it splits seconds into hours, minutes and seconds', () => {
    expect(HealthCheckReporter.toHumanUptime({ seconds: 3661 })).toBe('1h 1m 1s');
    expect(HealthCheckReporter.toHumanUptime({ seconds: 0.9 })).toBe('0h 0m 0s');
  });
});
