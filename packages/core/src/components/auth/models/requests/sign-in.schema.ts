import { requiredString } from '@/utilities';
import { z } from '@hono/zod-openapi';

export const SignInRequestSchema = z
  .object({
    identifier: z
      .object({
        scheme: requiredString({ min: 4 }),
        value: requiredString({ min: 8 }),
      })
      .openapi({
        required: ['scheme', 'value'],
        description: 'Sign-In Identifier',
      }),
    credential: z
      .object({
        scheme: requiredString(),
        value: requiredString({ min: 8 }),
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

export type TSignInRequest = z.infer<typeof SignInRequestSchema>;
