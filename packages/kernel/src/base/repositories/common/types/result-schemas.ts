import { z } from '@hono/zod-openapi';

/**
 * The zod-backed result schema, kept apart from `results.ts` ON PURPOSE. `z.object()` runs at module
 * load, so any bundle reaching this file carries the whole of zod - and `results.ts` is on
 * `AbstractRepository`'s path, which a consumer that never serves HTTP still needs.
 */
export const CountSchema = z.object({ count: z.number().default(0) }).openapi({
  description: 'Total count of items matching the criteria.',
  examples: [{ count: 0 }, { count: 10 }],
});
