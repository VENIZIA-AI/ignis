// What `IAuthRouteConfig` accepts and refuses. The typecheck is the test of the types; the run checks the CRUD routes.
import type { IAuthRouteConfig } from '@/base/controllers';
import { RouteConfigResolver } from '@/base/controllers/factory/definition';
import { OpenApiResponses } from '@/base/models';
import { z } from '@hono/zod-openapi';
import { describe, expect, test } from 'bun:test';

const Body = z.object({ name: z.string() });
const responses = OpenApiResponses.jsonResponse({ schema: Body });

const everything = {
  method: 'trace',
  path: '/orders/{id}',
  summary: 's',
  description: 'd',
  tags: ['orders'],
  operationId: 'o',
  deprecated: true,
  security: [{ jwt: [] }],
  hide: true,
  externalDocs: { url: 'https://example.test' },
  servers: [{ url: 'https://example.test' }],
  parameters: [{ name: 'q', in: 'query' }],
  callbacks: {},
  'x-owner': 'sales',
  request: {
    params: Body,
    query: Body,
    cookies: Body,
    headers: [Body],
    body: {
      description: 'b',
      required: true,
      'x-limit': 1,
      content: {
        'application/json': { schema: Body, example: 1, examples: {}, encoding: {}, 'x-a': 1 },
        'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
      },
    },
  },
  responses: {
    200: { description: 'ok', summary: 's', headers: {}, links: {}, 'x-b': 2 },
    204: {},
    404: { $ref: '#/components/responses/Missing' },
    default: { content: { 'application/json': { schema: Body } } },
  },
} satisfies IAuthRouteConfig;

const withRequestBody = {
  method: 'post',
  path: '/a',
  // @ts-expect-error `requestBody` is not a member: `request.body` is
  requestBody: { content: {} },
  responses,
} satisfies IAuthRouteConfig;

const withQueryMethod = {
  // @ts-expect-error `query` is not a method a route is registered under
  method: 'query',
  path: '/a',
  responses,
} satisfies IAuthRouteConfig;

const withUnknownMember = {
  method: 'get',
  path: '/a',
  // @ts-expect-error a member the type does not name
  produces: 'json',
  responses,
} satisfies IAuthRouteConfig;

describe('IAuthRouteConfig', () => {
  test('takes every member the contract keeps, and refuses the others (checked by the typecheck)', () => {
    expect([everything, withRequestBody, withQueryMethod, withUnknownMember]).toHaveLength(4);
  });

  test('a CRUD create route declares 201, with the error ranges', () => {
    const select = z.object({ id: z.string() });
    const routes = RouteConfigResolver.defineControllerRouteConfigs({
      isStrict: true,
      idType: 'string',
      routes: { create: true },
      authorize: { action: 'create', resource: 'order' },
      schema: { select, create: select, update: select },
    });

    expect(Object.keys(routes.CREATE?.responses ?? {})).toEqual(['201', '4XX', '5XX']);
  });
});
