import { z } from '@hono/zod-openapi';

export const LimitSchema = z
  .number()
  .optional()
  .openapi({
    description: 'Maximum number of items to return. Defaults to 10 for top-level list queries.',
    examples: [1, 2, 3],
  });

export type TLimit = z.infer<typeof LimitSchema>;
