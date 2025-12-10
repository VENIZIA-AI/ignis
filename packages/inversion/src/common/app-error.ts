import { z } from "zod";

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

  constructor(opts: TError) {
    const { message, messageCode, statusCode = 400 } = opts;
    super(message);

    this.statusCode = statusCode;
    this.messageCode = messageCode;
  }

  static getError(opts: TError) {
    return new ApplicationError(opts);
  }
}

export const getError = (opts: TError) => {
  return new ApplicationError(opts);
};
