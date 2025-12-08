import { z } from '@hono/zod-openapi';

export const ErrorSchema = z
  .object({
    name: z.string().optional(),
    statusCode: z.number().optional(),
    messageCode: z.string().optional(),
    message: z.string(),
  })
  .catchall(z.any())
  .openapi({
    description: 'Error Schema',
    example: {
      name: 'ErrorName',
      statusCode: '4xx | 5xx',
      messageCode: 'app.example.error_code',
      message: 'Example Message',
    },
  });

export type TError = z.infer<typeof ErrorSchema>;
