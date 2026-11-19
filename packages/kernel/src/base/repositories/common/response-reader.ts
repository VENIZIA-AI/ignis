import { HTTP } from '@venizia/ignis-helpers/common';
import type { TJsonValue } from '@venizia/ignis-helpers/common';
import { getError, ResponseReader } from '@venizia/ignis-helpers/core';
import type { ApplicationError, TResponsedError, UrlFetchError } from '@venizia/ignis-helpers/core';

/**
 * What an IGNIS server answers - `Content-Range`, the error envelope - read once, here, for every
 * client of that server: the http connector, and a client that reads it without the connector.
 */
export class HttpResponseReader {
  /** A content type that names JSON: `application/json`, `application/problem+json`, `application/ld+json`. */
  static readonly JSON_CONTENT_TYPE_PATTERN = /json/i;

  static isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
      !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
    );
  }

  /** An empty string reads as absent, so a fallback still applies. */
  static toText(value: unknown): string | undefined {
    return typeof value === 'string' && value !== '' ? value : undefined;
  }

  /**
   * A `Content-Range` header as the IGNIS server writes it: `records 0-24/137` -> skip 0, total 137;
   * an empty page, `records *\/137` -> total 137. Anything else, including an absent header or an
   * unknown total, is `undefined`.
   */
  static parseContentRange(opts: {
    header?: string | null;
  }): { skip?: number; total: number } | undefined {
    const { header } = opts;

    if (!header) {
      return undefined;
    }

    const range = header.match(/(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)/);

    if (range) {
      return { skip: Number(range[1]), total: Number(range[3]) };
    }

    const unsatisfied = header.match(/\*\s*\/\s*(\d+)/);

    if (unsatisfied) {
      return { total: Number(unsatisfied[1]) };
    }

    return undefined;
  }

  /**
   * The IGNIS error envelope - `{ message, statusCode, normalized: { text, code, args }, requestId,
   * extra, details }` - read off a parsed response body. A server configured with `error.rootKey`
   * wraps it under that key; pass the same `rootKey` to unwrap it. A body without that key, or with a
   * non-object under it (a proxy's `{ error: 'Bad Gateway' }`), is read as it stands.
   *
   * A body that is not a plain object yields `{}`; any other body yields its known fields, each
   * `undefined` when absent or mistyped. An empty string reads as absent.
   */
  static readErrorEnvelope(opts: { body: unknown; rootKey?: string }): TResponsedError {
    const { body, rootKey } = opts;

    const wrapped = rootKey && HttpResponseReader.isPlainObject(body) ? body[rootKey] : undefined;
    const envelope = HttpResponseReader.isPlainObject(wrapped) ? wrapped : body;

    if (!HttpResponseReader.isPlainObject(envelope)) {
      return {};
    }

    const { message, statusCode, normalized, requestId, extra, details } = envelope;
    const normalizedRecord = HttpResponseReader.isPlainObject(normalized) ? normalized : {};
    const { text, code, args } = normalizedRecord;

    return {
      message: HttpResponseReader.toText(message),
      statusCode: typeof statusCode === 'number' ? statusCode : undefined,
      normalized: {
        text: HttpResponseReader.toText(text),
        code: HttpResponseReader.toText(code),
        args: HttpResponseReader.isPlainObject(args) ? { ...args } : undefined,
      },
      requestId: HttpResponseReader.toText(requestId),
      extra: HttpResponseReader.isPlainObject(extra) ? { ...extra } : undefined,
      details: HttpResponseReader.isPlainObject(details) ? { ...details } : undefined,
    };
  }

  /** A failed response's envelope. A body that is not JSON yields `{}`, and the status alone still describes it. */
  static async readError(opts: { response: Response; rootKey?: string }): Promise<TResponsedError> {
    let text;

    try {
      const result = await opts.response.text();
      text = result;
      // eslint-disable-next-line venizia/no-silent-catch -- an unreadable body is read as no text; the status alone still describes the failure
    } catch {
      text = '';
    }

    let body: unknown;

    try {
      body = text ? JSON.parse(text) : undefined;
      // eslint-disable-next-line venizia/no-silent-catch -- a body that is not JSON yields `{}`; the status alone still describes the failure
    } catch {
      return {};
    }

    return HttpResponseReader.readErrorEnvelope({ body, rootKey: opts.rootKey });
  }

  /**
   * A failed response as the error the server threw: its status, code, args and text, and its
   * `extra` with the `requestId` added. `message` is `context` plus the server's text, for logs;
   * `normalized.text` stays the server's, for display - `HTTP <status>` when the server sent none.
   * `cause` is the server's `details.cause` - a 422's per-field issues, `{ path, message, code }`.
   *
   * `requestId` names the request this client made. A relaying server's `extra` carries the id of
   * the request it made upstream: it joins `upstreamRequestIds`, nearest first, at every hop.
   */
  static async toApplicationError(opts: {
    response: Response;
    /** Where it failed, for logs - e.g. `[HttpDataSource][read] 404 | /tickets`. */
    context: string;
    rootKey?: string;
  }): Promise<ApplicationError> {
    const { response, context, rootKey } = opts;
    const server = await HttpResponseReader.readError({ response, rootKey });
    const serverText = server.normalized?.text ?? server.message;
    const displayText = serverText ?? `HTTP ${response.status}`;

    const extra: Record<string, unknown> = { ...server.extra };

    if (server.requestId) {
      const upstreamRequestId = extra.requestId;
      extra.requestId = server.requestId;

      if (upstreamRequestId !== undefined && upstreamRequestId !== server.requestId) {
        const known = Array.isArray(extra.upstreamRequestIds) ? extra.upstreamRequestIds : [];
        extra.upstreamRequestIds = [upstreamRequestId, ...known];
      }
    }

    return getError({
      statusCode: response.status,
      message: serverText ? `${context} | ${serverText}` : context,
      messageCode: server.normalized?.code,
      messageArgs: server.normalized?.args,
      extra: Object.keys(extra).length > 0 ? extra : undefined,
      cause: server.details?.cause,
      transform: ({ message }) => ({ ...message, text: displayText }),
    });
  }

  /**
   * `toApplicationError` for a fetcher's refused answer: it reads the body the `UrlFetchError` kept (the first 64 KiB),
   * and an error that carries none is described by its status alone.
   */
  static async fromFetchError(opts: {
    error: UrlFetchError<Response>;
    context: string;
    rootKey?: string;
  }): Promise<ApplicationError> {
    const { error, context, rootKey } = opts;
    const response =
      error.response ?? new Response(null, { status: error.status, headers: error.headers });

    return HttpResponseReader.toApplicationError({ response, context, rootKey });
  }

  /**
   * The body as text: `''` for a 204 or an empty body. `response.json()` throws on those, and each client
   * that reads a response has copied the guard.
   */
  static async readText(opts: { response: Response }): Promise<string> {
    return ResponseReader.readText(opts);
  }

  /**
   * The body of a success answer, by what it says it is: `null` for a 204 or an empty body, the parsed
   * value when the content type names JSON (`application/json`, `application/problem+json`), the text itself
   * for any other type (`text/plain`, `text/csv`). A body that claims JSON and is not is a `502` that names
   * `context` (where it happened, e.g. `[Client][read] 200 | /tickets`), its size and its content type; its
   * content stays out of the message, which a relaying server may pass to its own clients.
   */
  static async readBody(opts: { response: Response; context: string }): Promise<TJsonValue> {
    const { response, context } = opts;
    const text = await HttpResponseReader.readText({ response });

    if (!text) {
      return null;
    }

    if (
      !HttpResponseReader.JSON_CONTENT_TYPE_PATTERN.test(
        response.headers.get(HTTP.Headers.CONTENT_TYPE) ?? '',
      )
    ) {
      return text;
    }

    return HttpResponseReader.parseJson({ text, response, context });
  }

  /**
   * The body as JSON whatever its content type says, `null` for a 204 or an empty body: for a route that
   * answers JSON under a type a proxy rewrote. Errors as `readBody` does.
   */
  static async readJson(opts: { response: Response; context: string }): Promise<TJsonValue> {
    const { response, context } = opts;
    const text = await HttpResponseReader.readText({ response });

    if (!text) {
      return null;
    }

    return HttpResponseReader.parseJson({ text, response, context });
  }

  private static parseJson(opts: {
    text: string;
    response: Response;
    context: string;
  }): TJsonValue {
    const { text, response, context } = opts;

    try {
      return JSON.parse(text);
    } catch {
      const contentType = response.headers.get(HTTP.Headers.CONTENT_TYPE) ?? 'none';

      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.BadGateway,
        message: `${context} | The response body is not JSON (${text.length} chars, content-type: ${contentType})`,
      });
    }
  }

  /**
   * A body the server marked with `x-response-extra` carries `extra` beside its rows. `body` is what
   * the route answers without extras: the `{ count, data }` envelope when the count was asked for in
   * the body, the rows otherwise. Any other body is returned as it stands - an unmarked object is
   * never unwrapped, so a row that has `data` and `extra` columns of its own is never misread.
   */
  static readExtra(opts: { body: unknown; headers: Pick<Headers, 'has'> }): {
    body: unknown;
    extra?: Record<string, unknown>;
  } {
    const { body, headers } = opts;
    const isMarked = headers.has(HTTP.Headers.RESPONSE_EXTRA);

    if (
      !isMarked ||
      !HttpResponseReader.isPlainObject(body) ||
      !HttpResponseReader.isPlainObject(body.extra)
    ) {
      return { body };
    }

    const { extra, ...envelope } = body;

    return { body: 'count' in envelope ? envelope : envelope.data, extra: { ...extra } };
  }
}
