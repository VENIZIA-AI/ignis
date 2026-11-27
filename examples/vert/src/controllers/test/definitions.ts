import { z } from '@hono/zod-openapi';
import { AuthenticateStrategy, type IAuthRouteConfig, OpenApiResponses } from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';

const Route5BodySchema = z.object({ name: z.string(), age: z.number().int().positive() });

// `satisfies` keeps each route's schemas in its type, which types the handlers
export const RouteConfigs = {
  ['/1']: {
    path: '/1',
    method: HTTP.Methods.GET,
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: OpenApiResponses.jsonContent({
        description: 'Test message content 1',
        schema: z.object({ message: z.string() }),
      }),
    },
  },
  ['/2']: {
    path: '/2',
    method: HTTP.Methods.GET,
    authenticate: { strategies: [AuthenticateStrategy.JWT] },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: OpenApiResponses.jsonContent({
        description: 'Test message content 1',
        schema: z.object({ message: z.string() }),
      }),
    },
  },
  ['/3']: {
    path: '/3',
    method: HTTP.Methods.GET,
    authenticate: { strategies: [AuthenticateStrategy.BASIC] },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: OpenApiResponses.jsonContent({
        description: 'Test message content 3',
        schema: z.object({ message: z.string() }),
      }),
    },
  },
  ['/4']: {
    method: HTTP.Methods.GET,
    path: '/4',
    responses: OpenApiResponses.jsonResponse({
      description: 'Test decorator GET endpoint',
      schema: z.object({ message: z.string(), method: z.string() }),
    }),
  },
  ['/5']: {
    method: HTTP.Methods.POST,
    path: '/5',
    request: {
      body: OpenApiResponses.jsonContent({
        description: 'Request body for POST',
        schema: Route5BodySchema,
      }),
    },
    responses: OpenApiResponses.jsonResponse({
      description: 'Test decorator POST endpoint',
      schema: z.object({ id: z.string(), name: z.string(), age: z.number() }),
    }),
  },
} satisfies Record<string, IAuthRouteConfig>;
