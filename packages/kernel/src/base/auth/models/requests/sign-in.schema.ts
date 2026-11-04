import { OpenApiSchemas } from '@/base/models/common';
import { z } from '@hono/zod-openapi';

/** Validates a sign-in body: an `identifier` and a `credential`, each a `scheme` plus `value`, and an optional `clientId`. */
export const SignInRequestSchema = z
  .object({
    identifier: z
      .object({
        scheme: OpenApiSchemas.requiredString({ min: 4 }),
        value: OpenApiSchemas.requiredString({ min: 8 }),
      })
      .openapi({
        required: ['scheme', 'value'],
        description: 'Sign-In Identifier',
      }),
    credential: z
      .object({
        scheme: OpenApiSchemas.requiredString(),
        value: OpenApiSchemas.requiredString({ min: 8 }),
      })
      .openapi({
        required: ['scheme', 'value'],
        description: 'Sign-In Credential',
      }),
    clientId: z.string().optional().openapi({
      description: 'Authenticate Provider',
    }),
  })
  .openapi({
    required: ['identifier', 'credential'],
    examples: [
      {
        identifier: { scheme: 'username', value: 'test_username' },
        credential: { scheme: 'basic', value: 'test_password' },
      },
      {
        identifier: { scheme: 'username', value: 'test_username' },
        credential: { scheme: 'basic', value: 'test_password' },
        clientId: 'auth-provider',
      },
    ],
  });

/** Parsed body of `SignInRequestSchema`. */
export type TSignInRequest = z.infer<typeof SignInRequestSchema>;
