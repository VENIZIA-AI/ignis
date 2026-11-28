import { z } from '@hono/zod-openapi';
import { getError, HTTP } from '@venizia/ignis-helpers';

/** What the server accepts from a client. Protobuf guarantees the types, not the content. */
export class NoteSchemas {
  static readonly SIGN_IN = z.object({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(256),
  });

  static readonly ID = z.object({ id: z.uuid() });

  static readonly DRAFT = z.object({
    title: z.string().trim().min(1).max(120),
    body: z.string().max(10_000),
  });

  /** The parsed value, or a 400 (`invalid_argument`) naming each field that is wrong. */
  static parse<Output>(opts: { schema: z.ZodType<Output>; value: unknown }): Output {
    const result = opts.schema.safeParse(opts.value);

    if (!result.success) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: NoteSchemas.describe({ error: result.error }),
      });
    }

    return result.data;
  }

  static describe(opts: { error: z.ZodError }) {
    return opts.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  }
}
