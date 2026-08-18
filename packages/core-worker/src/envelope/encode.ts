import type { ApplicationError } from '@venizia/ignis-helpers/core';
import { fromError, getError, isApplicationError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { IBffErrorEnvelope, IBffRequestEnvelope, IBffResponseEnvelope } from './types';

/**
 * Every request built inside the Worker uses this origin. Never `self.location.href`: a `blob:`
 * worker origin is opaque and `new URL(path, blobUrl)` throws, and Hono's `getPath()` mis-parses
 * `file://`. Hono never resolves the host - it string-scans from `indexOf(':') + 4`.
 */
export const BFF_SYNTHETIC_ORIGIN = 'http://ignis.internal';

/** Turns `Request`/`Response`/`Error` into plain structured-cloneable shapes and back - none of the three survives `postMessage` as itself. */
export class BffEnvelope {
  /**
   * Statuses the Fetch spec forbids a body on - `new Response(body, { status })` throws if `body`
   * is anything but `null` for one of these, even an empty `ArrayBuffer`.
   */
  private static readonly NULL_BODY_STATUSES = new Set([204, 205, 304]);

  /**
   * Moves a URL onto the synthetic origin, keeping everything below it. A caller builds a request
   * against the page's real origin (or a relative path resolved against it); `decodeRequest` on the
   * far side always reconstructs on `BFF_SYNTHETIC_ORIGIN`.
   */
  static toSyntheticUrl(opts: { url: string }): string {
    const url = new URL(opts.url);
    return `${BFF_SYNTHETIC_ORIGIN}${url.pathname}${url.search}${url.hash}`;
  }

  /**
   * `url` overrides the request's own, so the origin rewrite costs nothing: rebuilding the `Request`
   * to change its URL would read the body a second time, and a 10 MB upload would hold 20 MB on the
   * UI thread. Reading the body here disturbs the caller's request exactly as `globalThis.fetch`
   * does with the one it is handed.
   */
  static async encodeRequest(opts: {
    request: Request;
    id: string;
    url?: string;
  }): Promise<IBffRequestEnvelope> {
    const { request, id, url } = opts;
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

    return {
      id,
      method: request.method,
      url: url ?? request.url,
      headers: [...request.headers.entries()],
      body: hasBody ? await request.arrayBuffer() : undefined,
    };
  }

  static decodeRequest(opts: { envelope: IBffRequestEnvelope }): Request {
    const { envelope } = opts;

    return new Request(envelope.url, {
      method: envelope.method,
      headers: envelope.headers,
      body: envelope.body,
    });
  }

  static async encodeResponse(opts: {
    response: Response;
    id: string;
  }): Promise<IBffResponseEnvelope> {
    const { response, id } = opts;
    const hasBody = !BffEnvelope.NULL_BODY_STATUSES.has(response.status);

    return {
      id,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
      body: hasBody ? await response.arrayBuffer() : undefined,
    };
  }

  static decodeResponse(opts: { envelope: IBffResponseEnvelope }): Response {
    const { envelope } = opts;
    const body = BffEnvelope.NULL_BODY_STATUSES.has(envelope.status)
      ? null
      : (envelope.body ?? null);

    return new Response(body, {
      status: envelope.status,
      statusText: envelope.statusText,
      headers: envelope.headers,
    });
  }

  /**
   * Builds the shape an error crosses `postMessage` as. An `ApplicationError` cannot cross as itself
   * - a custom `Error` subclass loses its name, its own properties and its prototype through
   * structured clone - so it crosses normalised and `decodeError` rebuilds it on the far side.
   *
   * A foreign error gets `500`, matching what the framework's error middleware gives an UNEXPECTED
   * one on the server. Anything reaching here already escaped the whole HTTP layer.
   */
  static encodeError(opts: { id: string; error: unknown }): IBffErrorEnvelope {
    const { id, error } = opts;
    const applicationError = isApplicationError(error)
      ? error
      : getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: error instanceof Error ? error.message : String(error),
        });

    return {
      id,
      statusCode: applicationError.statusCode,
      error: {
        text: applicationError.normalized.text,
        code: applicationError.normalized.code,
        args: applicationError.normalized.args,
      },
    };
  }

  static decodeError(opts: { envelope: IBffErrorEnvelope }): ApplicationError {
    const { envelope } = opts;

    return fromError({
      error: {
        statusCode: envelope.statusCode,
        normalized: {
          text: envelope.error.text,
          code: envelope.error.code,
          args: envelope.error.args as Record<string, unknown> | undefined,
        },
      },
    });
  }
}
