import { z } from '@hono/zod-openapi';
import { AuthenticateStrategy, HTTP, IAuthRouteConfig, jsonContent } from '@venizia/ignis';

export const RouteConfigs: Record<string, IAuthRouteConfig> = {
  // Public — no authentication, no authorization
  ['/public']: {
    path: '/public',
    method: 'get',
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'Public endpoint — no auth required',
        schema: z.object({ message: z.string() }),
      }),
    },
  },

  // JWT auth only — no authorization check
  ['/profile']: {
    path: '/profile',
    method: 'get',
    authenticate: { strategies: [AuthenticateStrategy.JWT] },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'User profile — JWT authentication only',
        schema: z.object({ message: z.string(), userId: z.string() }),
      }),
    },
  },

  // JWT auth + authorization: must have "read" action on "configuration" resource
  ['/configurations']: {
    path: '/configurations',
    method: 'get',
    authenticate: { strategies: [AuthenticateStrategy.JWT] },
    authorize: { action: 'read', resource: 'configuration' },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'Configurations — requires authorization (read:configuration)',
        schema: z.object({ message: z.string(), data: z.array(z.string()) }),
      }),
    },
  },

  // JWT auth + authorization: must have "create" action on "user" resource
  ['/users']: {
    path: '/users',
    method: 'post',
    authenticate: { strategies: [AuthenticateStrategy.JWT] },
    authorize: { action: 'create', resource: 'user' },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'Create user — requires authorization (create:user)',
        schema: z.object({ message: z.string() }),
      }),
    },
  },

  // JWT auth + authorization with allowedRoles: only super-admin and admin
  ['/admin/dashboard']: {
    path: '/admin/dashboard',
    method: 'get',
    authenticate: { strategies: [AuthenticateStrategy.JWT] },
    authorize: {
      action: 'read',
      resource: 'dashboard',
      allowedRoles: ['999_super-admin', '900_admin'],
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'Admin dashboard — requires admin role',
        schema: z.object({ message: z.string(), stats: z.object({}) }),
      }),
    },
  },
} as const;
