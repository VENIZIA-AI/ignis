import { z } from '@hono/zod-openapi';

export const SkipSchema = z
  .number()
  .optional()
  .openapi({
    description: 'Number of items to skip for pagination.',
    examples: [1, 2, 3],
  });

export type TSkip = z.infer<typeof SkipSchema>;
