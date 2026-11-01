import { HTTP } from '@venizia/ignis-helpers/common';
import { readFormBody } from '@venizia/ignis-helpers/core';
import type { Context, Next } from 'hono';

export class FormBodyMiddleware {
  private static readonly FORM_CONTENT_TYPES = [
    HTTP.HeaderValues.MULTIPART_FORM_DATA,
    HTTP.HeaderValues.APPLICATION_FORM_URLENCODED,
  ];

  /** Whether a route declares a form body, so its validator will parse one. */
  static hasFormBody(opts: { content?: Record<string, unknown> }): boolean {
    const { content } = opts;
    return (
      content !== undefined &&
      FormBodyMiddleware.FORM_CONTENT_TYPES.some((contentType) => contentType in content)
    );
  }

  /**
   * Parses a declared form body just ahead of the route's validator, which reads the cached result.
   * Left to the validator, a malformed body is a bare `HTTPException(400)` carrying the parser's own
   * text and no code; read here, it is `core.request.body_malformed`. Mounted as a Hono middleware
   * handler (`FormBodyMiddleware.read`), so it never reads `this`.
   */
  static async read(context: Context, next: Next): Promise<void> {
    const contentType = context.req.header(HTTP.Headers.CONTENT_TYPE) ?? '';

    if (FormBodyMiddleware.FORM_CONTENT_TYPES.some((formType) => contentType.includes(formType))) {
      await readFormBody({ req: context.req });
    }

    await next();
  }
}
