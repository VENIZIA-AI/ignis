import { z } from '@hono/zod-openapi';

export const OrderBySchema = z
  .array(z.string())
  .optional()
  .openapi({
    description:
      "Sorting order for results. Supports regular columns ('fieldName ASC') and JSON/JSONB paths ('metadata.field DESC', 'data.nested[0].value ASC').",
    examples: [
      'id DESC',
      'createdAt ASC',
      'metadata.priority DESC',
      'data.nested.value ASC',
      'items[0].score DESC',
    ],
  });
