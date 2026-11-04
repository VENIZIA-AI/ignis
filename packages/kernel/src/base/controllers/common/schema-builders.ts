import { z } from '@hono/zod-openapi';

/** Zod schema of an object with any keys; the fallback response schema when a route sets none. */
export const AnyObjectSchema = z.object().catchall(z.any()).openapi({
  description: 'Unknown schema',
});

/** Zod object type of a plain raw shape, used to type request and response schemas. */
export type TAnyObjectSchema = z.ZodObject<z.ZodRawShape>;
/** The output type of a Zod schema `T`. */
export type TInferSchema<T extends z.ZodType> = z.infer<T>;
