import { jsonResponse } from '@venizia/ignis-kernel';
import { z } from '@hono/zod-openapi';

/**
 * Unauthenticated by design: it serves the PUBLIC key a callee needs to verify this service's
 * assertions. Whoever can reach it learns only which key signs, which is what verification requires.
 *
 * The schema names public members only. That is documentation, not a filter - a zod response schema
 * does not strip anything - so the guard that private material never gets here lives in the signer.
 */
export const ServiceCertsRouteConfigs = {
  GET_SERVICE_CERTS: {
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
            }),
          ),
        })
        .openapi({ description: 'Service assertion JSON Web Key Set' }),
      description: 'Service assertion JSON Web Key Set',
    }),
  },
} as const;
