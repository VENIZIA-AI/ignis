import { AbstractDataSource } from '@venizia/ignis-kernel/repository';
import { HTTP } from '@venizia/ignis-helpers/common';
import { NodeFetchNetworkRequest } from '@venizia/ignis-helpers/core';
import { getError } from '@venizia/ignis-helpers/core';
import type {
  IAuthToken,
  IHttpDataSourceSettings,
  IHttpReadResult,
  THttpHeaders,
} from './common/types';

const MAX_URL_IN_MESSAGE = 256;

/** A leading RFC 3986 scheme makes a URL absolute. Read by pattern: `URL.canParse` needs Safari 17 or Chrome 120, and this runs in pages. */
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;

/** A long `inq` makes a URL 200 KB: the message keeps its head and length. 414/431 name the URL. */
const describeUrl = (opts: { url: string; status: number }): string => {
  const { url, status } = opts;
  const shown =
    url.length > MAX_URL_IN_MESSAGE
      ? `${url.slice(0, MAX_URL_IN_MESSAGE)}... (${url.length} chars)`
      : url;

  const isTooLong =
    status === HTTP.ResultCodes.RS_4.URITooLong ||
    status === HTTP.ResultCodes.RS_4.RequestHeaderFieldsTooLarge;

  return isTooLong
    ? `${shown} | The URL is too long for a GET - split the filter (a long inq) into smaller requests.`
    : shown;
};

/**
 * A list is a bare array or the `{ count, data }` envelope; `one` is never unwrapped, since a record
 * may carry `data` and `count` columns. The envelope `count` is the page size, never the total.
 *
 * Anything else asked for as a list throws: counting it as one row is how `existsWith` answers true
 * for an empty result and a page reports a length it does not have.
 */
const unwrapBody = <R>(opts: { body: unknown; shape: 'list' | 'one'; url: string }): R => {
  const { body, shape, url } = opts;

  if (shape === 'one' || Array.isArray(body)) {
    return body as R;
  }

  if (body && typeof body === 'object' && 'data' in body && 'count' in body) {
    return (body as { data: R }).data;
  }

  throw getError({
    statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
    message: `[read] A list was asked for and the response is neither an array nor a { count, data } envelope | ${url}`,
  });
};

// `records 0-24/137` -> skip 0, total 137; an empty page `records */137` -> total 137; else undefined.
const readContentRange = (opts: {
  header: string | null;
}): { skip?: number; total: number } | undefined => {
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
};

/**
 * Caller headers as unique lowercase pairs, last spelling winning.
 *
 * Never `new Headers(input)`: that constructor APPENDS, so `{ 'X-Tenant': 'north', 'x-tenant':
 * 'south' }` - which a merge of two config objects produces - reaches the wire as `"north, south"`,
 * a value neither caller wrote. A `Headers` instance arrives already joined; that one is the
 * caller's own, and is passed through as it stands.
 */
const toHeaderEntries = (opts: { headers?: THttpHeaders }): Array<[string, string]> => {
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
};

/** Reads an IGNIS REST server through the repository contract. Targets IGNIS, not any REST API. */
export class HttpDataSource extends AbstractDataSource<IHttpDataSourceSettings> {
  override name: string;
  override settings: IHttpDataSourceSettings;
  override schema = {} as never;

  protected network: NodeFetchNetworkRequest;
  /** Normalised once: every request copies these, never re-parses `settings.headers`. */
  protected configuredHeaders: Array<[string, string]>;
  /** Decided once: a relative baseUrl (`/api`) needs a location to resolve against on every request. */
  protected isRelativeBaseUrl: boolean;

  constructor(opts: IHttpDataSourceSettings & { name?: string }) {
    super({ scope: opts.name ?? HttpDataSource.name });

    const { name = 'http', ...settings } = opts;

    const configured = toHeaderEntries({ headers: settings.headers });
    if (configured.some(([headerName]) => headerName === HTTP.Headers.REQUEST_COUNT_DATA)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${name}] ${HTTP.Headers.REQUEST_COUNT_DATA} is owned by HttpDataSource and always sent as false: rows come back bare, the total in Content-Range.`,
      });
    }

    this.configuredHeaders = configured;
    this.name = name;
    this.settings = settings;
    this.isRelativeBaseUrl = !URL_SCHEME_PATTERN.test(settings.baseUrl);
    this.network = new NodeFetchNetworkRequest({
      name,
      networkOptions: { baseUrl: settings.baseUrl },
    });
  }

  async configure(): Promise<void> {}

  override getCapabilities() {
    return { transactions: false };
  }

  protected resolveAuthToken(): IAuthToken | undefined {
    return this.settings.authToken ?? this.settings.authTokenResolver?.();
  }

  protected buildHeaders(opts: { token?: IAuthToken }): Headers {
    const { token } = opts;
    const headers = new Headers(this.configuredHeaders);

    // Set last: under the envelope a record read answers `{ count, data }`.
    headers.set(HTTP.Headers.REQUEST_COUNT_DATA, 'false');

    if (!token) {
      return headers;
    }

    headers.set(HTTP.Headers.AUTHORIZATION, `${token.type ?? 'Bearer'} ${token.value}`);

    // Unconditionally it would send the string "undefined".
    if (token.provider) {
      headers.set('x-auth-provider', token.provider);
    }

    return headers;
  }

  buildUrl(opts: { paths: Array<string>; query?: Record<string, unknown> }): string {
    const { paths, query } = opts;
    const requestUrl = this.network.getRequestUrl({ paths });

    // A page or a Web Worker has a location to resolve '/api' against; a server has none.
    const locationHref = this.isRelativeBaseUrl ? globalThis.location?.href : undefined;
    if (this.isRelativeBaseUrl && !locationHref) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${this.name}] Relative baseUrl '${this.settings.baseUrl}' needs a page or worker location to resolve against, and there is none here | Pass an absolute baseUrl such as 'https://api.example.com'`,
      });
    }

    const url = new URL(requestUrl, locationHref);

    const parameters = Object.entries(query ?? {});
    for (const [key, value] of parameters) {
      if (value === undefined) {
        continue;
      }

      url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    }

    return url.toString();
  }

  /** The raw `Response` - for what is not rows, like an export. Auth and the 401 retry apply. */
  async request(opts: {
    paths: Array<string>;
    query?: Record<string, unknown>;
    method?: string;
  }): Promise<Response> {
    const url = this.buildUrl(opts);

    const send = () =>
      this.network.getNetworkService().send({
        url,
        method: (opts.method ?? HTTP.Methods.GET) as never,
        headers: this.buildHeaders({ token: this.resolveAuthToken() }),
      });

    let response = await send();

    if (response.status === HTTP.ResultCodes.RS_4.Unauthorized && this.settings.onUnauthorized) {
      const shouldRetry = await this.settings.onUnauthorized();

      if (shouldRetry) {
        response = await send();
      }
    }

    return response;
  }

  /** Rows plus the total from `Content-Range`, reported absent when the header is. */
  async read<R>(opts: {
    paths: Array<string>;
    query?: Record<string, unknown>;
    shape?: 'list' | 'one';
  }): Promise<IHttpReadResult<R>> {
    const response = await this.request(opts);

    if (!response.ok) {
      throw getError({
        statusCode: response.status,
        message: `[${this.name}][read] ${response.status} | ${describeUrl({ url: this.buildUrl(opts), status: response.status })}`,
      });
    }

    const body = await response.json();
    const contentRange = response.headers.get(HTTP.Headers.CONTENT_RANGE) ?? undefined;
    const range = readContentRange({ header: contentRange ?? null });
    const data = unwrapBody<R>({ body, shape: opts.shape ?? 'list', url: this.buildUrl(opts) });

    return {
      data,
      hasRange: range !== undefined,
      contentRange,
      total: range?.total,
      skip: range?.skip,
      dataLength: Array.isArray(data) ? data.length : 1,
    };
  }
}
