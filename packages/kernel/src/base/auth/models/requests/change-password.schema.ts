import { OpenApiSchemas } from '@/base/models/common';
import { z } from '@hono/zod-openapi';

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

export type TChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
