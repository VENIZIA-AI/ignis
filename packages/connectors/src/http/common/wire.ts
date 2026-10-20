import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { HttpExtraRequest } from '@venizia/ignis-kernel/repository';
import type { TExtraRequest, THttpBody, THttpHeaders } from './types';

/**
 * What `HttpDataSource` puts on the wire and reads back off it: headers, request bodies, rows and
 * the path an error message names. Internal - not part of the `http` entry.
 */
export class HttpWire {
  /**
   * Caller headers as unique lowercase pairs, last spelling winning.
   *
   * Never `new Headers(input)`: that constructor APPENDS, so `{ 'X-Tenant': 'north', 'x-tenant':
   * 'south' }` - which a merge of two config objects produces - reaches the wire as `"north, south"`,
   * a value neither caller wrote. A `Headers` instance arrives already joined; that one is the
   * caller's own, and is passed through as it stands.
   */
  static toHeaderEntries(opts: { headers?: THttpHeaders }): Array<[string, string]> {
    const { headers } = opts;

    if (!headers) {
      return [];
    }

    const source =
      headers instanceof Headers
        ? [...headers.entries()]
        : Array.isArray(headers)
          ? headers
          : Object.entries(headers);

    const merged = new Map<string, string>();
    for (const [name, value] of source) {
      merged.set(name.toLowerCase(), value);
    }

    return [...merged.entries()];
  }

  /** The connector always sends `x-request-count: false`; a caller header carrying it would contradict that. */
  static assertNoRequestCountHeader(opts: {
    entries: Array<[string, string]>;
    name: string;
  }): void {
    const { entries, name } = opts;

    if (entries.some(([headerName]) => headerName === HTTP.Headers.REQUEST_COUNT_DATA)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${name}] ${HTTP.Headers.REQUEST_COUNT_DATA} is owned by HttpDataSource and always sent as false: rows come back bare, the total in Content-Range.`,
      });
    }
  }

  /**
   * The body as `fetch` takes it. Anything `fetch` already sends as a body passes through untouched;
   * any other object is JSON. Serialised ONCE, so the 401 retry sends the same bytes.
   */
  static toRequestBody(opts: { body?: THttpBody }): {
    payload: RequestInit['body'];
    isJson: boolean;
    isFormData: boolean;
  } {
    const { body } = opts;

    if (body === undefined) {
      return { payload: undefined, isJson: false, isFormData: false };
    }

    const isFormData = body instanceof FormData;
    const isSentAsIs =
      isFormData ||
      typeof body === 'string' ||
      body instanceof Blob ||
      body instanceof URLSearchParams ||
      body instanceof ArrayBuffer;

    if (isSentAsIs) {
      return { payload: body, isJson: false, isFormData };
    }

    // A typed array may sit on a SharedArrayBuffer, which `fetch` refuses; a Blob copy never does.
    if (ArrayBuffer.isView(body)) {
      return {
        payload: new Blob([new Uint8Array(body.buffer, body.byteOffset, body.byteLength).slice()]),
        isJson: false,
        isFormData: false,
      };
    }

    return {
      payload: HttpWire.toJson({ value: body, label: 'The request body' }),
      isJson: true,
      isFormData: false,
    };
  }

  /** JSON, or a 400 naming what failed: a bigint or a cycle would otherwise escape as a bare TypeError. */
  static toJson(opts: { value: unknown; label: string }): string {
    const { value, label } = opts;

    try {
      return JSON.stringify(value);
    } catch (error) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `${label} cannot be sent as JSON | ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  /**
   * A list is a bare array or the `{ count, data }` envelope; `one` is never unwrapped, since a record
   * may carry `data` and `count` columns. The envelope `count` is the page size, never the total.
   *
   * Anything else asked for as a list throws: counting it as one row is how `existsWith` answers true
   * for an empty result and a page reports a length it does not have.
   */
  static unwrapRows<R>(opts: { body: unknown; shape: 'list' | 'one'; url: string }): R {
    const { body, shape, url } = opts;

    if (shape === 'one' || Array.isArray(body)) {
      return body as R;
    }

    if (body && typeof body === 'object' && 'data' in body && 'count' in body) {
      return (body as { data: R }).data;
    }

    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: `[read] A list was asked for and the response is neither an array nor a { count, data } envelope | ${HttpWire.describeUrl({ url })}`,
    });
  }

  /**
   * The call's headers plus `x-request-extra` for the extras it asks for - `name`, `-name`,
   * `name(key,key)` - and `-*` first when it wants the rows alone, with every default off.
   */
  static withExtraHeader(opts: {
    headers?: THttpHeaders;
    extra?: TExtraRequest;
    isEveryDefaultOff?: boolean;
  }): THttpHeaders | undefined {
    const { headers, extra, isEveryDefaultOff } = opts;
    const value = HttpExtraRequest.toHeader({ extra, isEveryDefaultOff });

    if (value === undefined) {
      return headers;
    }

    const extraHeader: [string, string] = [HttpExtraRequest.HEADER, value];
    return [...HttpWire.toHeaderEntries({ headers }), extraHeader];
  }

  /**
   * The path a message names - never the host or the query. A server that relays this error would
   * otherwise send an internal host and a filter's values to its own clients. 414/431 add the length.
   */
  static describeUrl(opts: { url: string; status?: number }): string {
    const { url, status } = opts;
    const { pathname } = new URL(url);

    const isTooLong =
      status === HTTP.ResultCodes.RS_4.URITooLong ||
      status === HTTP.ResultCodes.RS_4.RequestHeaderFieldsTooLarge;

    return isTooLong
      ? `${pathname} (${url.length} chars) | The URL is too long for a GET - split the filter (a long inq) into smaller requests.`
      : pathname;
  }
}
