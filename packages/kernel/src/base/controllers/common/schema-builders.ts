import { z } from '@hono/zod-openapi';

export const AnyObjectSchema = z.object().catchall(z.any()).openapi({
  description: 'Unknown schema',
});

export type TAnyObjectSchema = z.ZodObject<z.ZodRawShape>;
export type TInferSchema<T extends z.ZodType> = z.infer<T>;
