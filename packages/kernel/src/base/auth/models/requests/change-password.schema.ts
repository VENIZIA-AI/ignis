import { OpenApiSchemas } from '@/base/models/common';
import { z } from '@hono/zod-openapi';

/** Validates a change-password body: `scheme`, `oldCredential` and `newCredential` (each at least 8 characters) and the `userId`. */
export const ChangePasswordRequestSchema = z
  .object({
    scheme: z.string(),
    oldCredential: OpenApiSchemas.requiredString({ min: 8 }),
    newCredential: OpenApiSchemas.requiredString({ min: 8 }),
    userId: z.string().or(z.number()),
  })
  .openapi({
    examples: [
      {
        scheme: 'basic',
        oldCredential: 'old_password',
        newCredential: 'new_password',
        userId: 'user-id',
      },
    ],
  });

/** Parsed body of `ChangePasswordRequestSchema`. */
export type TChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
