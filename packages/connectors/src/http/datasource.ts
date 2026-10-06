import { AbstractDataSource } from '@venizia/ignis-kernel/repository';
import { HTTP } from '@venizia/ignis-helpers/common';
import { NodeFetchNetworkRequest } from '@venizia/ignis-helpers/core';
import { getError } from '@venizia/ignis-helpers/core';
import { HttpResponseReader } from './common/readers';
import type {
  IAuthToken,
  IHttpCallOptions,
  IHttpDataSourceSettings,
  IHttpReadResult,
  IHttpRequestContext,
  IHttpWriteResult,
  THttpBody,
} from './common/types';
import { HttpWire } from './common/wire';

/** A scheme and `//` make a URL absolute - `localhost:3000` has neither. Read by pattern: `URL.canParse` needs Safari 17 or Chrome 120, and this runs in pages. */
const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+.-]*:\/\//i;

/** Reads an IGNIS REST server through the repository contract. Targets IGNIS, not any REST API. */
export class HttpDataSource extends AbstractDataSource<IHttpDataSourceSettings> {
  override name: string;
  override settings: IHttpDataSourceSettings;
  override schema = {} as never;

  protected network: NodeFetchNetworkRequest;
  /** Normalised once: every request copies these, never re-parses `settings.headers`. */
  protected configuredHeaders: Array<[string, string]>;
  /** Decided once: a relative baseUrl (`/api`) is resolved against the page origin on every request. */
  protected isRelativeBaseUrl: boolean;

  constructor(opts: IHttpDataSourceSettings & { name?: string }) {
    super({ scope: opts.name ?? HttpDataSource.name });

    const { name = 'http', ...settings } = opts;

    const configured = HttpWire.toHeaderEntries({ headers: settings.headers });
    HttpWire.assertNoRequestCountHeader({ entries: configured, name });

    this.isRelativeBaseUrl = !ABSOLUTE_URL_PATTERN.test(settings.baseUrl);

    // Against the page, `api` would follow the current route; `localhost:3000` is not a URL at all.
    if (this.isRelativeBaseUrl && !settings.baseUrl.startsWith('/')) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${name}] baseUrl '${settings.baseUrl}' is neither absolute nor a path from the origin | Pass '/api' or an absolute URL such as 'https://api.example.com'`,
      });
    }

    this.configuredHeaders = configured;
    this.name = name;
    this.settings = settings;
    this.network = new NodeFetchNetworkRequest({
      name,
      networkOptions: { baseUrl: settings.baseUrl },
    });
  }

  async configure(): Promise<void> {}

  override getCapabilities() {
    return { transactions: false };
  }

  protected resolveAuthToken(opts: { context: IHttpRequestContext }): IAuthToken | undefined {
    return this.settings.authToken ?? this.settings.authTokenResolver?.(opts.context);
  }

  /** Re-run on every send, so a header the app changed since the last request is the one sent. */
  protected resolveHeaders(opts: { context: IHttpRequestContext }): Array<[string, string]> {
    const resolver = this.settings.headersResolver;
    if (!resolver) {
      return [];
    }

    const entries = HttpWire.toHeaderEntries({ headers: resolver(opts.context) });
    HttpWire.assertNoRequestCountHeader({ entries, name: this.name });

    return entries;
  }

  protected buildHeaders(opts: {
    token?: IAuthToken;
    requestHeaders?: Array<[string, string]>;
    isJsonBody?: boolean;
    isFormDataBody?: boolean;
  }): Headers {
    const { token, requestHeaders, isJsonBody, isFormDataBody } = opts;
    const headers = new Headers(this.configuredHeaders);

    // A request's own headers win over the configured ones; the connector's below win over both.
    for (const [name, value] of requestHeaders ?? []) {
      headers.set(name, value);
    }

    if (isJsonBody && !headers.has(HTTP.Headers.CONTENT_TYPE)) {
      headers.set(HTTP.Headers.CONTENT_TYPE, 'application/json');
    }

    // Only `fetch` knows the multipart boundary; any other content-type here would drop it.
    if (isFormDataBody) {
      headers.delete(HTTP.Headers.CONTENT_TYPE);
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

    // A page or a Web Worker has an origin to resolve '/api' against; a server has none.
    const origin = this.isRelativeBaseUrl ? globalThis.location?.origin : undefined;
    if (this.isRelativeBaseUrl && !origin) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${this.name}] Relative baseUrl '${this.settings.baseUrl}' needs a page or worker location to resolve against, and there is none here | Pass an absolute baseUrl such as 'https://api.example.com'`,
      });
    }

    const url = new URL(requestUrl, origin);

    const parameters = Object.entries(query ?? {});
    for (const [key, value] of parameters) {
      if (value === undefined) {
        continue;
      }

      url.searchParams.set(
        key,
        typeof value === 'string'
          ? value
          : HttpWire.toJson({ value, label: `[${this.name}] Query parameter '${key}'` }),
      );
    }

    return url.toString();
  }

  /**
   * The raw `Response`, on any method - for what the repository verbs do not cover, like an export
   * or a PUT to a hand-written route. Auth and the 401 retry apply; the retry resends the same body.
   */
  async request(
    opts: {
      paths: Array<string>;
      query?: Record<string, unknown>;
      method?: string;
      body?: THttpBody;
    } & IHttpCallOptions,
  ): Promise<Response> {
    return this.sendRequest({ ...opts, url: this.buildUrl(opts) });
  }

  /** `request` on a URL already built: `read` and `write` serialise a long query once, not per use. */
  protected async sendRequest(
    opts: {
      paths: Array<string>;
      url: string;
      method?: string;
      body?: THttpBody;
    } & IHttpCallOptions,
  ): Promise<Response> {
    const { url, signal } = opts;
    const requestHeaders = HttpWire.toHeaderEntries({ headers: opts.headers });
    HttpWire.assertNoRequestCountHeader({ entries: requestHeaders, name: this.name });

    const method = opts.method ?? HTTP.Methods.GET;
    const context: IHttpRequestContext = { paths: opts.paths, method, url, signal };
    const { payload, isJson, isFormData } = HttpWire.toRequestBody({ body: opts.body });

    // Both hooks run inside `send`, so the retry sends what they answer after the refresh.
    const send = () =>
      this.network.getNetworkService().send({
        url,
        method: method as never,
        body: payload,
        signal,
        headers: this.buildHeaders({
          token: this.resolveAuthToken({ context }),
          // Resolved first, so the call's own headers win over them.
          requestHeaders: [...this.resolveHeaders({ context }), ...requestHeaders],
          isJsonBody: isJson,
          isFormDataBody: isFormData,
        }),
      });

    let response = await send();

    if (response.status === HTTP.ResultCodes.RS_4.Unauthorized && this.settings.onUnauthorized) {
      const shouldRetry = await this.settings.onUnauthorized(context);

      // A call aborted while the session refreshed is not sent again.
      if (shouldRetry) {
        signal?.throwIfAborted();
        response = await send();
      }
    }

    return response;
  }

  /**
   * The body as JSON, `null` when there is none; a body that is not JSON is the server's fault, named
   * as such. Its content stays out of the message, which a relaying server may pass to its clients.
   */
  protected async readJsonBody(opts: { response: Response; url: string; verb: string }) {
    const { response, url, verb } = opts;
    const text = await response.text();

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.BadGateway,
        message: `[${this.name}][${verb}] ${response.status} | ${HttpWire.describeUrl({ url, status: response.status })} | The response body is not JSON (${text.length} chars, content-type: ${response.headers.get(HTTP.Headers.CONTENT_TYPE) ?? 'none'})`,
      });
    }
  }

  /**
   * A failed response as the error the server threw: its status, code, args and text, and its
   * `extra` with the `requestId` added. `message` adds where it failed, for logs; `normalized.text`
   * stays the server's, for display - `HTTP <status>` when the server sent none. `cause` is the server's `details.cause` - a 422's per-field
   * issues, `{ path, message, code }`.
   */
  protected async toResponseError(opts: { response: Response; url: string; verb: string }) {
    const { response, url, verb } = opts;
    const server = await HttpResponseReader.readError({
      response,
      rootKey: this.settings.errorRootKey,
    });
    const serverText = server.normalized?.text ?? server.message;
    const displayText = serverText ?? `HTTP ${response.status}`;
    const described = HttpWire.describeUrl({ url, status: response.status });

    // `requestId` names the request this client made. A relaying server's `extra` carries the id
    // of the request it made upstream: it joins `upstreamRequestIds`, nearest first, at every hop.
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
      message: serverText
        ? `[${this.name}][${verb}] ${response.status} | ${described} | ${serverText}`
        : `[${this.name}][${verb}] ${response.status} | ${described}`,
      messageCode: server.normalized?.code,
      messageArgs: server.normalized?.args,
      extra: Object.keys(extra).length > 0 ? extra : undefined,
      cause: server.details?.cause,
      transform: ({ message }) => ({ ...message, text: displayText }),
    });
  }

  /**
   * Rows plus the total from `Content-Range`, reported absent when the header is. A GET unless told
   * otherwise: `method` and `body` reach a list route a service wrote to take its filter in a body.
   */
  async read<R>(
    opts: {
      paths: Array<string>;
      query?: Record<string, unknown>;
      shape?: 'list' | 'one';
      method?: string;
      body?: THttpBody;
    } & IHttpCallOptions,
  ): Promise<IHttpReadResult<R>> {
    const url = this.buildUrl(opts);
    const response = await this.sendRequest({ ...opts, url });

    if (!response.ok) {
      throw await this.toResponseError({ response, url, verb: 'read' });
    }

    // A 204 or an empty body is no row; a list asked for of it still throws below.
    const body = await this.readJsonBody({ response, url, verb: 'read' });
    const contentRange = response.headers.get(HTTP.Headers.CONTENT_RANGE) ?? undefined;
    const range = HttpResponseReader.parseContentRange({ header: contentRange });
    const data = HttpWire.unwrapRows<R>({ body, shape: opts.shape ?? 'list', url });

    return {
      data,
      hasRange: range !== undefined,
      contentRange,
      total: range?.total,
      skip: range?.skip,
      dataLength: Array.isArray(data) ? data.length : data === null ? 0 : 1,
    };
  }

  /**
   * A write, and what it answered: the body as the rows, the count from `x-response-count`. The
   * connector asks for bare rows, so an IGNIS write answers the row or the rows, never the envelope.
   */
  async write<R>(
    opts: {
      paths: Array<string>;
      query?: Record<string, unknown>;
      method: string;
      body?: THttpBody;
    } & IHttpCallOptions,
  ): Promise<IHttpWriteResult<R>> {
    const url = this.buildUrl(opts);
    const response = await this.sendRequest({ ...opts, url });

    if (!response.ok) {
      throw await this.toResponseError({ response, url, verb: 'write' });
    }

    // A 204, or a route that answers nothing, has no body to parse.
    const data = await this.readJsonBody({ response, url, verb: 'write' });

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
