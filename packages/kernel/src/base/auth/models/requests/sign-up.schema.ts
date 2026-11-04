import { z } from '@hono/zod-openapi';

/** Validates a sign-up body: `username` and `credential`, each a non-empty string of at least 8 characters. */
export const SignUpRequestSchema = z
  .object({
    username: z.string().nonempty().min(8),
    credential: z.string().nonempty().min(8),
  })
  .openapi({
    required: ['username', 'credential'],
    examples: [
      {
        username: 'example_username',
        credential: 'example_credential',
      },
    ],
  });

/** Parsed body of `SignUpRequestSchema`. */
export type TSignUpRequest = z.infer<typeof SignUpRequestSchema>;
