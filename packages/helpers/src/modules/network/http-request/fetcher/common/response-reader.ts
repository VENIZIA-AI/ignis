import { HTTP } from '@/common/constants/http';
import type { TJsonValue } from '@/common/types';
import { getError } from '@/modules/error';
import type { ApplicationError, TResponsedError } from '@/modules/error';
import type { UrlFetchError } from '@/modules/network/utilities/url-safety/common/errors';
import { RecordUtility } from '@/utilities/record.utility';
import { BodyLimit } from './body-limit';

/**
 * What an IGNIS server answers - `Content-Range`, the error envelope - read once, here, for every
 * client of that server: the http connector, and a client that reads it without the connector.
 */
export class HttpResponseReader {
  /** A content type that names JSON: `application/json`, `application/problem+json`, `application/ld+json`. */
  static readonly JSON_CONTENT_TYPE_PATTERN = /json/i;

  /** An empty string reads as absent, so a fallback still applies. */
  private static toText(value: unknown): string | undefined {
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

    const wrapped = rootKey && RecordUtility.isPlainObject(body) ? body[rootKey] : undefined;
    const envelope = RecordUtility.isPlainObject(wrapped) ? wrapped : body;

    if (!RecordUtility.isPlainObject(envelope)) {
      return {};
    }

    const { message, statusCode, normalized, requestId, extra, details } = envelope;
    const normalizedRecord = RecordUtility.isPlainObject(normalized) ? normalized : {};
    const { text, code, args } = normalizedRecord;

    return {
      message: HttpResponseReader.toText(message),
      statusCode: typeof statusCode === 'number' ? statusCode : undefined,
      normalized: {
        text: HttpResponseReader.toText(text),
        code: HttpResponseReader.toText(code),
        args: RecordUtility.isPlainObject(args) ? { ...args } : undefined,
      },
      requestId: HttpResponseReader.toText(requestId),
      extra: RecordUtility.isPlainObject(extra) ? { ...extra } : undefined,
      details: RecordUtility.isPlainObject(details) ? { ...details } : undefined,
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
   * `extra` with the `requestId` added. `message` is `context` plus the server's text, for logs; without
   * `context` it is the server's text alone (`HTTP <status>` when it sent none), for a client that shows
   * `message` to users. `normalized.text` is the server's either way - `HTTP <status>` when none.
   * `cause` is the server's `details.cause` - a 422's per-field issues, `{ path, message, code }`.
   *
   * `requestId` names the request this client made. A relaying server's `extra` carries the id of
   * the request it made upstream: it joins `upstreamRequestIds`, nearest first, at every hop.
   */
  static async toApplicationError(opts: {
    response: Response;
    /** Where it failed, for logs - e.g. `[HttpDataSource][read] 404 | /tickets`. Left out, `message` is the server's text. */
    context?: string;
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
      message:
        context === undefined ? displayText : serverText ? `${context} | ${serverText}` : context,
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
    context?: string;
    rootKey?: string;
  }): Promise<ApplicationError> {
    const { error, context, rootKey } = opts;
    // A hand-built error may carry a status a `Response` refuses (below 200 or above 599, e.g. 0): that is a bad gateway.
    const isResponseStatus = error.status >= 200 && error.status <= 599;
    const response =
      error.response ??
      new Response(null, {
        status: isResponseStatus ? error.status : HTTP.ResultCodes.RS_5.BadGateway,
        headers: error.headers,
      });

    return HttpResponseReader.toApplicationError({ response, context, rootKey });
  }

  /** The body as text: `''` for a 204, an empty body or no body; with `maxBytes` the read stops and fails at the cap. */
  static async readText(opts: { response: Response; maxBytes?: number }): Promise<string> {
    const { response, maxBytes } = opts;

    if (response.status === HTTP.ResultCodes.RS_2.NoContent || response.body === null) {
      return '';
    }

    return maxBytes === undefined ? response.text() : BodyLimit.readText({ response, maxBytes });
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
   * A download as a file: its `blob`, the `filename` of its `Content-Disposition` (`filename*` first) and its `contentType`.
   * A non-2xx answer throws what `toApplicationError({ response })` throws, so an error page is never saved as a file.
   */
  static async readFile(opts: {
    response: Response;
  }): Promise<{ blob: Blob; filename?: string; contentType?: string }> {
    const { response } = opts;

    if (!response.ok) {
      const result = await HttpResponseReader.toApplicationError({ response });
      throw result;
    }

    const { filename } = HttpResponseReader.parseContentDisposition({
      header: response.headers.get(HTTP.Headers.CONTENT_DISPOSITION),
    });

    const blob = await response.blob();

    return {
      blob,
      filename,
      contentType: response.headers.get(HTTP.Headers.CONTENT_TYPE) ?? undefined,
    };
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
      !RecordUtility.isPlainObject(body) ||
      !RecordUtility.isPlainObject(body.extra)
    ) {
      return { body };
    }

    const { extra, ...envelope } = body;

    return { body: 'count' in envelope ? envelope : envelope.data, extra: { ...extra } };
  }

  /**
   * Reads a filename out of a `Content-Disposition` value.
   *
   * Three forms, in the order the RFC gives them precedence: `filename*=UTF-8''...` or `filename*=ISO-8859-1''...`
   * (percent-encoded, and the one hand-rolled parsers miss; another charset falls through), a quoted `filename="..."`, and a bare `filename=...`.
   * Splitting on `filename=` alone returns the percent-encoded bytes for any non-ASCII name, which in
   * a product with non-English filenames is most of them.
   *
   * The pair of `RequestUtility.buildContentDispositionHeader`: one writes the header, this one reads it.
   */
  static parseContentDisposition(opts: { header: string | null | undefined }): {
    type?: string;
    filename?: string;
  } {
    const { header } = opts;

    if (!header) {
      return {};
    }

    const type = header.split(';')[0]?.trim() || undefined;

    // `filename*` wins when both are present - it is the one that can carry a non-ASCII name.
    const extended = header.match(/filename\*\s*=\s*([^;]+)/i);

    if (extended) {
      const value = extended[1].trim();
      // `UTF-8''name` or `UTF-8'lang'name`; anything before the last quote is charset and language.
      const encoded = value.slice(value.lastIndexOf("'") + 1);
      const charset = value.slice(0, Math.max(value.indexOf("'"), 0)).toLowerCase();

      try {
        // UTF-8 and ISO-8859-1 are the two charsets RFC 8187 names; any other falls through to `filename`.
        if (charset === '' || charset === 'utf-8') {
          return { type, filename: decodeURIComponent(encoded) || undefined };
        }

        if (charset === 'iso-8859-1') {
          const decoded = encoded.replace(/%([0-9a-f]{2})/gi, (_, hex: string) =>
            String.fromCharCode(Number.parseInt(hex, 16)),
          );

          return { type, filename: decoded || undefined };
        }
        // eslint-disable-next-line venizia/no-silent-catch -- a malformed `filename*` falls through to the plain `filename` parameter; only the extended name is lost
      } catch {
        // A malformed sequence is not worth failing a download over - fall through to `filename`.
      }
    }

    // An empty name is no name: `filename=""` and `filename*=UTF-8''` answer `undefined`, so `name ?? fallback` falls back.
    const quoted = header.match(/filename\s*=\s*"([^"]*)"/i);

    if (quoted) {
      return { type, filename: quoted[1] || undefined };
    }

    const bare = header.match(/filename\s*=\s*([^;]+)/i);

    return { type, filename: bare?.[1].trim() || undefined };
  }
}
