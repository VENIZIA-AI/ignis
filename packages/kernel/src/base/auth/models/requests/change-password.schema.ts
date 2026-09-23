import { requiredString } from '@/base/controllers/common/schema-builders';
import { z } from '@hono/zod-openapi';

export const ChangePasswordRequestSchema = z
  .object({
    scheme: z.string(),
    oldCredential: requiredString({ min: 8 }),
    newCredential: requiredString({ min: 8 }),
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
