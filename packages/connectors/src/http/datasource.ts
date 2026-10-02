import { AbstractDataSource } from '@venizia/ignis-kernel/repository';
import { HTTP } from '@venizia/ignis-helpers/common';
import { NodeFetchNetworkRequest } from '@venizia/ignis-helpers/core';
import { getError } from '@venizia/ignis-helpers/core';
import type {
  IAuthToken,
  IHttpDataSourceSettings,
  IHttpReadResult,
  IHttpWriteResult,
  THttpBody,
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

/**
 * The body as `fetch` takes it. Anything `fetch` already sends as a body passes through untouched,
 * so `FormData` keeps the multipart boundary its own content-type carries; any other object is JSON.
 * Serialised ONCE, so the 401 retry sends the same bytes.
 */
const toRequestBody = (opts: {
  body?: THttpBody;
}): { payload: RequestInit['body']; isJson: boolean } => {
  const { body } = opts;

  if (body === undefined) {
    return { payload: undefined, isJson: false };
  }

  const isSentAsIs =
    typeof body === 'string' ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer;

  if (isSentAsIs) {
    return { payload: body, isJson: false };
  }

  // A typed array may sit on a SharedArrayBuffer, which `fetch` refuses; a Blob copy never does.
  if (ArrayBuffer.isView(body)) {
    return {
      payload: new Blob([new Uint8Array(body.buffer, body.byteOffset, body.byteLength).slice()]),
      isJson: false,
    };
  }

  return { payload: JSON.stringify(body), isJson: true };
};

/**
 * The IGNIS error envelope - `{ message, normalized: { code, args }, requestId }` - read off a failed
 * response. A body that is not that envelope yields nothing, and the status alone still describes it.
 * `args` fill a translated message's placeholders; only a plain object is taken.
 */
const readServerError = async (opts: {
  response: Response;
}): Promise<{
  message?: string;
  code?: string;
  args?: Record<string, unknown>;
  requestId?: string;
}> => {
  const text = await opts.response.text().catch(() => '');

  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== 'object') {
    return {};
  }

  const message = Reflect.get(parsed, 'message');
  const requestId = Reflect.get(parsed, 'requestId');
  const normalized = Reflect.get(parsed, 'normalized');
  const isNormalizedObject = !!normalized && typeof normalized === 'object';
  const code = isNormalizedObject ? Reflect.get(normalized, 'code') : undefined;
  const args = isNormalizedObject ? Reflect.get(normalized, 'args') : undefined;
  const isArgsRecord =
    !!args && typeof args === 'object' && Object.getPrototypeOf(args) === Object.prototype;

  return {
    message: typeof message === 'string' ? message : undefined,
    code: typeof code === 'string' ? code : undefined,
    args: isArgsRecord ? { ...args } : undefined,
    requestId: typeof requestId === 'string' ? requestId : undefined,
  };
};

/** The connector always sends `x-request-count: false`; a caller header carrying it would contradict that. */
const assertNoRequestCountHeader = (opts: {
  entries: Array<[string, string]>;
  name: string;
}): void => {
  const { entries, name } = opts;

  if (entries.some(([headerName]) => headerName === HTTP.Headers.REQUEST_COUNT_DATA)) {
    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: `[${name}] ${HTTP.Headers.REQUEST_COUNT_DATA} is owned by HttpDataSource and always sent as false: rows come back bare, the total in Content-Range.`,
    });
  }
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
    assertNoRequestCountHeader({ entries: configured, name });

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

  protected buildHeaders(opts: {
    token?: IAuthToken;
    requestHeaders?: Array<[string, string]>;
    isJsonBody?: boolean;
  }): Headers {
    const { token, requestHeaders, isJsonBody } = opts;
    const headers = new Headers(this.configuredHeaders);

    // A request's own headers win over the configured ones; the connector's below win over both.
    for (const [name, value] of requestHeaders ?? []) {
      headers.set(name, value);
    }

    if (isJsonBody && !headers.has(HTTP.Headers.CONTENT_TYPE)) {
      headers.set(HTTP.Headers.CONTENT_TYPE, 'application/json');
    }

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

  /**
   * The raw `Response`, on any method - for what the repository verbs do not cover, like an export
   * or a PUT to a hand-written route. Auth and the 401 retry apply; the retry resends the same body.
   */
  async request(opts: {
    paths: Array<string>;
    query?: Record<string, unknown>;
    method?: string;
    body?: THttpBody;
    headers?: THttpHeaders;
  }): Promise<Response> {
    const requestHeaders = toHeaderEntries({ headers: opts.headers });
    assertNoRequestCountHeader({ entries: requestHeaders, name: this.name });

    const url = this.buildUrl(opts);
    const { payload, isJson } = toRequestBody({ body: opts.body });

    const send = () =>
      this.network.getNetworkService().send({
        url,
        method: (opts.method ?? HTTP.Methods.GET) as never,
        body: payload,
        headers: this.buildHeaders({
          token: this.resolveAuthToken(),
          requestHeaders,
          isJsonBody: isJson,
        }),
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

  /** A failed response as an error carrying the server's own status, message and message code. */
  protected async toResponseError(opts: { response: Response; url: string; verb: string }) {
    const { response, url, verb } = opts;
    const server = await readServerError({ response });
    const described = describeUrl({ url, status: response.status });

    return getError({
      statusCode: response.status,
      message: server.message
        ? `[${this.name}][${verb}] ${response.status} | ${described} | ${server.message}`
        : `[${this.name}][${verb}] ${response.status} | ${described}`,
      messageCode: server.code,
      messageArgs: server.args,
      extra: server.requestId ? { requestId: server.requestId } : undefined,
    });
  }

  /**
   * Rows plus the total from `Content-Range`, reported absent when the header is. A read is a GET
   * unless told otherwise: a filter too long for a URL goes as the body of a POST read route.
   */
  async read<R>(opts: {
    paths: Array<string>;
    query?: Record<string, unknown>;
    shape?: 'list' | 'one';
    method?: string;
    body?: THttpBody;
  }): Promise<IHttpReadResult<R>> {
    const response = await this.request(opts);

    if (!response.ok) {
      throw await this.toResponseError({ response, url: this.buildUrl(opts), verb: 'read' });
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

  /**
   * A write, and what it answered: the body as the rows, the count from `x-response-count`. The
   * connector asks for bare rows, so an IGNIS write answers the row or the rows, never the envelope.
   */
  async write<R>(opts: {
    paths: Array<string>;
    query?: Record<string, unknown>;
    method: string;
    body?: THttpBody;
    headers?: THttpHeaders;
  }): Promise<IHttpWriteResult<R>> {
    const response = await this.request(opts);

    if (!response.ok) {
      throw await this.toResponseError({ response, url: this.buildUrl(opts), verb: 'write' });
    }

    // A 204, or a route that answers nothing, has no body to parse.
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    const countHeader = response.headers.get(HTTP.Headers.RESPONSE_COUNT_DATA);
    const counted = countHeader === null ? Number.NaN : Number(countHeader);

    return {
      data,
      count: Number.isFinite(counted)
        ? counted
        : Array.isArray(data)
          ? data.length
          : data === null
            ? 0
            : 1,
    };
  }
}
