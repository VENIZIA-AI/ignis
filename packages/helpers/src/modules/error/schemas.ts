import { z } from '@hono/zod-openapi';

/** The error RESPONSE for OpenAPI docs, NOT the input to `getError` (that union, with no index signature, lives in `@venizia/ignis-inversion`). Kept out of the error barrel because it needs `@hono/zod-openapi`, and the barrel is on the browser path through `getError`. */
export const ErrorSchema = z
  .object({
    statusCode: z.number().optional(),
    message: z.string(),
    normalized: z
      .object({
        text: z.string(),
        code: z.string(),
        args: z.record(z.string(), z.any()),
      })
      .optional(),
    extra: z.record(z.string(), z.any()).optional(),
    requestId: z.string().optional(),
    details: z.record(z.string(), z.any()).optional(),
  })
  .openapi({
    description: 'Error Schema',
    example: {
      statusCode: 409,
      message: 'A category named %{name} already exists.',
      normalized: {
        text: 'A category named %{name} already exists.',
        code: 'server.commerce.category.create.duplicate_name',
        args: { name: 'Ticket' },
      },
      extra: { categoryId: 42 },
      requestId: 'abc-123-def',
      details: { url: 'http://localhost:3000/categories', path: '/categories' },
    },
  });

export type TErrorResponse = z.infer<typeof ErrorSchema>;
