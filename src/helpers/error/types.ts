import { z } from '@hono/zod-openapi';

export const ZErrorSchema = z
  .object({
    statusCode: z
      .number()
      .optional()
      .openapi({
        examples: [400, 401, 403],
      }),
    messageCode: z.string().optional().openapi({
      example: 'app.messasge.example_message_code',
    }),
    message: z.string().openapi({
      example: 'Application example message',
    }),
  })
  .catchall(z.any());

export type TError = z.infer<typeof ZErrorSchema>;
