import omit from 'lodash/omit';
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

export class ApplicationError extends Error {
  statusCode: number;
  messageCode?: string;
  extra?: Record<string, unknown>;

  constructor(opts: TError) {
    const { message, messageCode, statusCode = 400, ...rest } = opts;
    super(message);

    this.statusCode = statusCode;
    this.messageCode = messageCode;

    const extra = omit(rest, ['name']);
    this.extra = Object.keys(extra).length > 0 ? extra : undefined;
  }

  static getError(opts: TError) {
    return new ApplicationError(opts);
  }
}

export const getError = (opts: TError) => {
  return new ApplicationError(opts);
};
