import { jsonResponse } from '@/base/models/common/types';
import { z } from '@hono/zod-openapi';

// The /certs endpoint is intentionally unauthenticated — it serves the public
// JWKS needed by external verifiers to validate tokens issued by this service.
export const RouteConfigs = {
  GET_JWKS_CERTS: {
    path: '/',
    method: 'get',
    responses: jsonResponse({
      schema: z
        .object({
          keys: z.array(
            z.object({
              kty: z.string(),
              kid: z.string().optional(),
              use: z.string().optional(),
              alg: z.string().optional(),
              crv: z.string().optional(),
              x: z.string().optional(),
              y: z.string().optional(),
              n: z.string().optional(),
              e: z.string().optional(),
            }),
          ),
        })
        .openapi({ description: 'JSON Web Key Set' }),

      description: 'JSON Web Key Set',
    }),
  },
} as const;
