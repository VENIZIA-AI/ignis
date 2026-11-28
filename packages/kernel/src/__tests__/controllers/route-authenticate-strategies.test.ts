import 'reflect-metadata';
import { AuthenticationStrategyRegistry } from '@/base/auth/authenticate/strategies/strategy-registry';
import type { IAuthenticationStrategy } from '@/base/auth/authenticate/common/types';
import type { IAuthRouteConfig } from '@/base/controllers/common/types';
import { RouteConfigResolver } from '@/base/controllers/factory/definition';
import { BaseRestController } from '@/base/controllers/rest/base';
import { BaseAppErrorMiddleware } from '@/base/middlewares';
import { Container } from '@/helpers/inversion/container';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { describe, expect, spyOn, test } from 'bun:test';

class ProbeController extends BaseRestController {
  override binding() {}
}

const probe = new ProbeController({ scope: 'ProbeController', path: '/probe' });

const config = (authenticate?: unknown) => {
  const route = {
    method: 'get',
    path: '/',
    responses: { 200: { description: 'ok' } },
  } satisfies IAuthRouteConfig;

  if (authenticate !== undefined) {
    Reflect.set(route, 'authenticate', authenticate);
  }

  return route;
};

const middlewaresOf = (route: IAuthRouteConfig) =>
  probe.buildRouteMiddlewares({ configs: route }).mws;

describe('a REST route whose authenticate names no strategy', () => {
  const refused = [
    { strategies: [] },
    {},
    { mode: 'all' },
    { strategies: undefined },
    { strategies: null },
    { strategies: 'jwt' },
    { strategies: { 0: 'jwt', length: 1 } },
    { skip: true },
    true,
  ];

  test.each(refused.map((authenticate) => ({ authenticate })))(
    '$authenticate is refused at boot',
    ({ authenticate }) => {
      expect(() => middlewaresOf(config(authenticate))).toThrow(
        '[ProbeController] Route "GET /": authenticate names no strategy',
      );
    },
  );

  test.each([undefined, null, false].map((authenticate) => ({ authenticate })))(
    '$authenticate leaves the route public',
    ({ authenticate }) => {
      const route = config();
      Reflect.set(route, 'authenticate', authenticate);

      expect(middlewaresOf(route)).toEqual([]);
    },
  );
});

describe('a public route of a generated controller has no authenticate', () => {
  test('nothing configured anywhere', () => {
    expect(RouteConfigResolver.resolveAuthenticate({})).toBeUndefined();
  });

  test('{ skip: true } over a controller with strategies', () => {
    expect(
      RouteConfigResolver.resolveAuthenticate({
        controller: { strategies: ['jwt'] },
        endpoint: { skip: true },
      }),
    ).toBeUndefined();
  });

  test('an authenticate that names nothing is kept, so that boot refuses it', () => {
    expect(RouteConfigResolver.resolveAuthenticate({ controller: { strategies: [] } })).toEqual({
      strategies: [],
      mode: undefined,
    });
    expect(RouteConfigResolver.resolveAuthenticate({ endpoint: {} })).toEqual({
      strategies: undefined,
      mode: undefined,
    });
  });
});

describe('mode all with a strategy that is not registered', () => {
  class KnownStrategy implements IAuthenticationStrategy {
    name = 'known';

    async authenticate() {
      return { userId: 'u1' };
    }
  }

  test('answers a generic 500 with no registry text', async () => {
    AuthenticationStrategyRegistry.getInstance().register({
      container: new Container({ scope: 'route-authenticate-strategies' }),
      strategies: [{ name: 'known', strategy: KnownStrategy }],
    });
    const app = new OpenAPIHono();
    app.onError(new BaseAppErrorMiddleware().value());
    const route = probe.getRouteConfigs({
      configs: {
        method: 'get',
        path: '/',
        responses: {
          200: { description: 'ok', content: { 'text/plain': { schema: z.string() } } },
        },
        authenticate: { strategies: ['known', 'missing'], mode: 'all' },
      },
    });
    app.openapi(route, (context) => context.text('ran', 200));

    const errors = spyOn(console, 'error');
    const response = await app.request('/', {}, { NODE_ENV: 'development' });
    const lines = errors.mock.calls.map((call) => call.map(String).join(' '));
    errors.mockRestore();
    const body: unknown = await response.json();
    const message: unknown = Reflect.get(Object(body), 'message');

    expect(response.status).toBe(500);
    expect(body).toHaveProperty('message', 'Authentication is not available');
    expect(String(message)).not.toMatch(/Registry|missing/);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('missing');
  });
});
