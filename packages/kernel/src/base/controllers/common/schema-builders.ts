import { OpenApiSchemas } from '@/base/models/common';
import { z } from '@hono/zod-openapi';

/** @deprecated Use OpenApiSchemas.requiredString({ min, max, fixed }). Removed in 0.5. */
export const requiredString = (opts?: { min?: number; max?: number; fixed?: number }) => {
  return OpenApiSchemas.requiredString(opts);
};

export const AnyObjectSchema = z.object().catchall(z.any()).openapi({
  description: 'Unknown schema',
});

export type TAnyObjectSchema = z.ZodObject<z.ZodRawShape>;
export type TInferSchema<T extends z.ZodType> = z.infer<T>;
