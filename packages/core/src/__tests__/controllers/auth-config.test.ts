// Import order guard: see route-registration.test.ts.
import '@/base/applications';

import { describe, expect, test } from 'bun:test';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';

import type { TRouteContext } from '@/base/controllers';
import { BaseRestController } from '@/base/controllers';
import { defineControllerRouteConfigs } from '@/base/controllers/factory';
import { model } from '@/base/metadata';
import { jsonResponse } from '@/base/models';
import { SchemaTypes } from '@/base/models/common/constants';
import {
  AuthenticateStrategy,
  AuthenticationModes,
} from '@/components/auth/authenticate/common/constants';
import { AuthorizationActions } from '@/components/auth/authorize/common/constants';
import { BasePostgresEntity } from '@/connectors/postgres/models';
import type { TAnyObjectSchema } from '@/utilities/schema.utility';
import { z } from '@hono/zod-openapi';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers';
import { HTTP } from '@venizia/ignis-helpers';

const okResponse = jsonResponse({ schema: z.object({ hit: z.string() }), description: 'ok' });

@model({ type: 'entity' })
class AuthConfigAccount extends BasePostgresEntity<typeof AuthConfigAccount.schema> {
  static override schema = pgTable('auth_config_account', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }),
  });
}

const entityInstance = new AuthConfigAccount();

const buildRouteDefinitions = (opts: {
  authenticate?: { strategies?: Array<string>; mode?: string };
  authorize?: object;
  routes?: object;
}) => {
  return defineControllerRouteConfigs({
    isStrict: true,
    idType: entityInstance.getIdType(),
    authenticate: opts.authenticate as never,
    authorize: opts.authorize as never,
    routes: opts.routes as never,
    schema: {
      select: entityInstance.getSchema<TAnyObjectSchema>({ type: SchemaTypes.SELECT }),
      create: entityInstance.getSchema<TAnyObjectSchema>({ type: SchemaTypes.CREATE }),
      update: entityInstance.getSchema<TAnyObjectSchema>({ type: SchemaTypes.UPDATE }),
    },
  });
};

/** Exposes getRouteConfigs (the middleware/security injector) without mounting anything. */
class AuthProbeController extends BaseRestController {
  override binding(): ValueOrPromise<void> {
    // routes are inspected directly, never mounted.
  }
}

const probeController = new AuthProbeController({ scope: 'AuthProbeController', path: '/probe' });

/** `getRouteConfigs` is typed as the caller's own RouteConfig; `middleware`/`security` are the fields it injects, so they only exist on the value, never on that type. */
const injectedRouteConfigs = (
  configs: AnyType,
): {
  middleware?: Array<unknown>;
  security?: Array<Record<string, Array<string>>>;
  tags?: Array<string>;
} => {
  return probeController.getRouteConfigs({ configs }) as AnyType;
};

describe('Route auth config - controller level vs route level', () => {
  test('a route without its own authenticate inherits the controller strategies', () => {
    const definitions = buildRouteDefinitions({
      authenticate: { strategies: [AuthenticateStrategy.JWT], mode: AuthenticationModes.ANY },
    });

    expect(definitions.FIND.authenticate).toEqual({
      strategies: [AuthenticateStrategy.JWT],
      mode: AuthenticationModes.ANY,
    });
  });

  test('a route-level authenticate REPLACES (never merges with) the controller strategies', () => {
    const definitions = buildRouteDefinitions({
      authenticate: {
        strategies: [AuthenticateStrategy.JWT, AuthenticateStrategy.BASIC],
        mode: AuthenticationModes.ANY,
      },
      routes: { create: { authenticate: { strategies: [AuthenticateStrategy.BASIC] } } },
    });

    expect(definitions.CREATE.authenticate).toEqual({
      strategies: [AuthenticateStrategy.BASIC],
      mode: AuthenticationModes.ANY,
    });

    const routeConfigs = injectedRouteConfigs(definitions.CREATE);
    expect(routeConfigs.middleware?.length).toBe(1);
    expect(routeConfigs.security).toEqual([{ [AuthenticateStrategy.BASIC]: [] }]);
  });

  test('authenticate.skip makes the route public AND drops the inherited authorize spec', () => {
    const definitions = buildRouteDefinitions({
      authenticate: { strategies: [AuthenticateStrategy.JWT] },
      authorize: { action: AuthorizationActions.READ, resource: 'account' },
      routes: { find: { authenticate: { skip: true } } },
    });

    expect(definitions.FIND.authenticate).toEqual({ strategies: [] });
    expect(definitions.FIND.authorize).toBeUndefined();

    const routeConfigs = injectedRouteConfigs(definitions.FIND);
    expect(routeConfigs.middleware).toEqual([]);
    expect(routeConfigs.security).toEqual([]);
  });

  test('authorize.skip keeps authentication but drops only the authorize middleware', () => {
    const definitions = buildRouteDefinitions({
      authenticate: { strategies: [AuthenticateStrategy.JWT] },
      authorize: { action: AuthorizationActions.READ, resource: 'account' },
      routes: { count: { authorize: { skip: true } } },
    });

    expect(definitions.COUNT.authorize).toBeUndefined();

    const routeConfigs = injectedRouteConfigs(definitions.COUNT);
    expect(routeConfigs.middleware?.length).toBe(1);
  });

  test('a protected route gets exactly one authenticate + one authorize middleware (no duplication)', () => {
    const definitions = buildRouteDefinitions({
      authenticate: { strategies: [AuthenticateStrategy.JWT] },
      authorize: { action: AuthorizationActions.READ, resource: 'account' },
    });

    const routeConfigs = injectedRouteConfigs(definitions.FIND);
    expect(routeConfigs.middleware?.length).toBe(2);

    // The same definition object is reused on every controller instance, so re-processing it must not accumulate middleware/tags on the shared config.
    const reprocessed = injectedRouteConfigs(definitions.FIND);
    expect(reprocessed.middleware?.length).toBe(2);
    expect(definitions.FIND).not.toHaveProperty('middleware');
  });

  test('an array of authorize specs yields one authorize middleware per spec, after authenticate', () => {
    const definitions = buildRouteDefinitions({
      authenticate: { strategies: [AuthenticateStrategy.JWT] },
      authorize: [
        { action: AuthorizationActions.READ, resource: 'account' },
        { action: AuthorizationActions.READ, resource: 'profile' },
      ],
    });

    const routeConfigs = injectedRouteConfigs(definitions.FIND);
    expect(routeConfigs.middleware?.length).toBe(3);
  });

  test('getRouteConfigs appends the controller scope to the route tags and keeps custom middleware last', () => {
    const customMiddleware = async (_context: unknown, next: () => Promise<void>) => {
      await next();
    };

    const routeConfigs = injectedRouteConfigs({
      method: HTTP.Methods.GET,
      path: '/tagged',
      tags: ['custom'],
      authenticate: { strategies: [AuthenticateStrategy.JWT] },
      middleware: customMiddleware,
      responses: okResponse,
    });

    expect(routeConfigs.tags).toEqual(['custom', 'AuthProbeController']);
    expect(routeConfigs.middleware?.length).toBe(2);
    expect(routeConfigs.middleware?.[1]).toBe(customMiddleware);
  });

  test('a route with no authenticate at all mounts with zero auth middleware (public by default)', async () => {
    class PublicRouteController extends BaseRestController {
      override binding(): ValueOrPromise<void> {
        this.defineRoute({
          configs: { method: HTTP.Methods.GET, path: '/public', responses: okResponse },
          handler: (context: TRouteContext) =>
            context.json({ hit: 'public' }, HTTP.ResultCodes.RS_2.Ok),
        });
      }
    }

    const restController = new PublicRouteController({
      scope: 'PublicRouteController',
      path: '/public-controller',
    });
    await restController.configure();

    const response = await restController.getRouter().request('/public');
    expect(response.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    expect(await response.json()).toEqual({ hit: 'public' });
  });
});
