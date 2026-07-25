import { z } from '@hono/zod-openapi';

export const FieldsSchema = z
  .record(z.string(), z.boolean())
  .or(z.array(z.string()))
  .optional()
  .openapi({
    description:
      'Fields selection - either an array of field names to include, or an object with field names as keys and boolean values (true to include, false to exclude)',
    examples: [
      JSON.stringify(['id', 'name', 'email']),
      JSON.stringify({ id: true, name: true }),
      JSON.stringify({ id: true, name: true, email: true, fullName: false }),
    ],
  });
