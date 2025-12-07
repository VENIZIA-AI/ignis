import { z } from 'zod';

export const ErrorSchema = z
  .object({
    name: z.string().optional(),
    statusCode: z.number().optional(),
    messageCode: z.string().optional(),
    message: z.string(),
  })
  .catchall(z.any());

export type TError = z.infer<typeof ErrorSchema>;
