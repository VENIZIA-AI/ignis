import { HTTP } from '@venizia/ignis-helpers/common';
import type { TResponsedError } from '@venizia/ignis-helpers/core';

/**
 * What an IGNIS server answers - `Content-Range`, the error envelope - read once, here, for every
 * client of that server: the http connector, and a client that reads it without the connector.
 */
export class HttpResponseReader {
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
    const text = await opts.response.text().catch(() => '');

    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      return {};
    }

    return HttpResponseReader.readErrorEnvelope({ body, rootKey: opts.rootKey });
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
