import { z } from '@hono/zod-openapi';
import { Authentication, HTTP, jsonContent, jsonResponse } from '@venizia/ignis';

// Define route configs as const for type inference
export const ROUTE_CONFIGS = {
  ['/1']: {
    path: '/1',
    method: 'get',
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'Test message content 1',
        schema: z.object({ message: z.string() }),
      }),
    },
  },
  ['/2']: {
    path: '/2',
    method: 'get',
    authStrategies: [Authentication.STRATEGY_JWT],
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'Test message content 1',
        schema: z.object({ message: z.string() }),
      }),
    },
  },
  ['/3']: {
    path: '/3',
    method: 'get',
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'Test message content 3',
        schema: z.object({ message: z.string() }),
      }),
    },
  },
  ['/4']: {
    method: HTTP.Methods.GET,
    path: '/4',
    responses: jsonResponse({
      description: 'Test decorator GET endpoint',
      schema: z.object({ message: z.string(), method: z.string() }),
    }),
  },
  ['/5']: {
    method: HTTP.Methods.POST,
    path: '/5',
    request: {
      body: jsonContent({
        description: 'Request body for POST',
        schema: z.object({ name: z.string(), age: z.number().int().positive() }),
      }),
    },
    responses: jsonResponse({
      description: 'Test decorator POST endpoint',
      schema: z.object({ id: z.string(), name: z.string(), age: z.number() }),
    }),
  },
} as const;