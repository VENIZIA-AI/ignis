import type { TResponsedError } from '@venizia/ignis-helpers/core';
import { HttpWire } from './wire';

/**
 * What an IGNIS server answers, read the way `HttpDataSource` reads it - exported so another client
 * of the same server shares the parsing instead of copying it.
 */
export class HttpResponseReader {
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

    const wrapped = rootKey && HttpWire.isPlainObject(body) ? body[rootKey] : undefined;
    const envelope = HttpWire.isPlainObject(wrapped) ? wrapped : body;

    if (!HttpWire.isPlainObject(envelope)) {
      return {};
    }

    const { message, statusCode, normalized, requestId, extra, details } = envelope;
    const normalizedRecord = HttpWire.isPlainObject(normalized) ? normalized : {};
    const { text, code, args } = normalizedRecord;

    return {
      message: HttpWire.toText(message),
      statusCode: typeof statusCode === 'number' ? statusCode : undefined,
      normalized: {
        text: HttpWire.toText(text),
        code: HttpWire.toText(code),
        args: HttpWire.isPlainObject(args) ? { ...args } : undefined,
      },
      requestId: HttpWire.toText(requestId),
      extra: HttpWire.isPlainObject(extra) ? { ...extra } : undefined,
      details: HttpWire.isPlainObject(details) ? { ...details } : undefined,
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
}
