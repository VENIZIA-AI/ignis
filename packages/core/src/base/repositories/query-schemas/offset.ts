import { z } from '@hono/zod-openapi';

export const OffsetSchema = z
  .number()
  .optional()
  .openapi({
    description: 'Number of items to offset for pagination.',
    examples: [1, 2, 3],
  });
