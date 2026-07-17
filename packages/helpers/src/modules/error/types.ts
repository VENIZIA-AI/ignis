import { z } from '@hono/zod-openapi';

/**
 * The error RESPONSE, for OpenAPI documentation - NOT the input to `getError`.
 *
 * The two used to be the same type, and that conflation is what let `getError` accept anything: the
 * schema ended in `.catchall(z.any())` so the docs could describe `extra`, and the catchall then
 * silently swallowed every mistyped field at every throw site. The input now lives in
 * `@venizia/ignis-inversion` as a hand-written union with no index signature; this stays here
 * because it needs `@hono/zod-openapi`, which inversion must not depend on - it ships to browsers.
 */
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
