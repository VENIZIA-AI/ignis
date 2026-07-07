import { z } from '@hono/zod-openapi';

/** @internal Recursive schema for where clause validation with nested AND/OR. */
const _WhereSchema: z.ZodType<any> = z.lazy(() =>
  z.record(z.string(), z.any()).and(
    z.object({
      and: z.array(_WhereSchema).optional(),
      or: z.array(_WhereSchema).optional(),
    }),
  ),
);

export const WhereSchema = z
  .union([
    _WhereSchema,
    z
      .string()
      .transform(val => {
        if (val) {
          return JSON.parse(val);
        }

        return undefined;
      })
      .pipe(_WhereSchema),
  ])
  .openapi({
    type: 'object',
    description: 'Query conditions for selecting data.',
  });

export type TWhere<T = any> = { [key in keyof T]?: any } & { and?: TWhere<T>[]; or?: TWhere<T>[] };
