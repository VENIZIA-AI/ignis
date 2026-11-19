import { HttpReadShapes, HttpWireHeaders, type THttpReadShape } from './common/constants';
import { DataSourceRoot } from '@venizia/ignis-kernel/repository';
import { HTTP } from '@venizia/ignis-helpers/common';
import { NativeFetcher, UrlBuilder, UrlFetchError } from '@venizia/ignis-helpers/core';
import { HttpResponseReader } from './common/readers';
import type {
  IAuthToken,
  IHttpCallOptions,
  IHttpDataSourceSettings,
  TExtraRequest,
  IHttpReadResult,
  IHttpRequestContext,
  IHttpWriteResult,
  THttpBody,
} from './common/types';
import { HttpWire } from './common/wire';

/** A scheme and `//` make a URL absolute - `localhost:3000` has neither. Read by pattern: `URL.canParse` needs Safari 17 or Chrome 120, and this runs in pages. */
/** Reads an IGNIS REST server through the repository contract. Targets IGNIS, not any REST API. */
export class HttpDataSource extends DataSourceRoot<IHttpDataSourceSettings> {
  override name: string;
  override settings: IHttpDataSourceSettings;
  override schema = {} as never;

  /** Normalised once: every request copies these, never re-parses `settings.headers`. */
  protected configuredHeaders: Array<[string, string]>;

  constructor(opts: IHttpDataSourceSettings & { name?: string }) {
    super({ scope: opts.name ?? HttpDataSource.name });

    const { name = 'http', ...settings } = opts;

    const configured = HttpWire.toHeaderEntries({ headers: settings.headers });
    HttpWire.assertNoRequestCountHeader({ entries: configured, name });

    UrlBuilder.assertBase({ baseUrl: settings.baseUrl, scope: name });

    this.configuredHeaders = configured;
    this.name = name;
    this.settings = settings;
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
      headers.set(HTTP.Headers.CONTENT_TYPE, HTTP.HeaderValues.APPLICATION_JSON);
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
      headers.set(HttpWireHeaders.AUTH_PROVIDER, token.provider);
    }

    return headers;
  }

  buildUrl(opts: { paths: Array<string>; query?: Record<string, unknown> }): string {
    const { paths, query } = opts;
    // An id with a double slash stays under the base, so it is not refused here as it is for a third-party client.
    const url = UrlBuilder.join({ baseUrl: this.settings.baseUrl, paths, scope: this.name });

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
    const { onUnauthorized } = this.settings;

    // One fetcher per call: its hooks close over this call's context. Both resolvers run in `onRequest`, so the retry sends what they answer after the refresh.
    const fetcher = new NativeFetcher({
      name: this.name,
      fetch: this.settings.fetch,
      hooks: {
        onRequest: ({ headers }) => {
          const built = this.buildHeaders({
            token: this.resolveAuthToken({ context }),
            // Resolved first, so the call's own headers win over them.
            requestHeaders: [...this.resolveHeaders({ context }), ...requestHeaders],
            isJsonBody: isJson,
            isFormDataBody: isFormData,
          });

          for (const name of [...headers.keys()]) {
            headers.delete(name);
          }

          built.forEach((value, name) => headers.set(name, value));
        },
      },
    });

    try {
      const response = await fetcher.send({
        url,
        method,
        body: payload,
        signal,
        // Every status is an answer the data source reads itself; a 401 with a refresh hook throws once so the retry can see it.
        acceptStatus: (status) => !onUnauthorized || status !== HTTP.ResultCodes.RS_4.Unauthorized,
        retry: onUnauthorized
          ? {
              maxAttempts: 2,
              backoff: { initialDelayMs: 0, maxDelayMs: 0 },
              shouldRetry: async ({ error, attempt }) => {
                if (
                  !UrlFetchError.is(error) ||
                  error.status !== HTTP.ResultCodes.RS_4.Unauthorized
                ) {
                  return false;
                }

                const isRefreshed = await onUnauthorized({ ...context, attempt });

                // The second 401 stands: the hook hears of it, its answer is ignored, and nothing is sent a third time.
                return attempt === 1 && isRefreshed;
              },
            }
          : undefined,
      });

      return response;
    } catch (error) {
      // The 401 that stands is the answer: the data source reads its body into its own error.
      if (
        error instanceof UrlFetchError &&
        error.status === HTTP.ResultCodes.RS_4.Unauthorized &&
        error.response instanceof Response
      ) {
        return error.response;
      }

      throw error;
    }
  }

  /**
   * The body as JSON, `null` when there is none; a body that is not JSON is the server's fault, named
   * as such. Its content stays out of the message, which a relaying server may pass to its clients.
   */
  protected async readJsonBody(opts: { response: Response; url: string; verb: string }) {
    const { response, url, verb } = opts;

    return HttpResponseReader.readJson({
      response,
      context: `[${this.name}][${verb}] ${response.status} | ${HttpWire.describeUrl({ url, status: response.status })}`,
    });
  }

  /**
   * A failed response as the error the server threw: its status, code, args and text, and its
   * `extra` with the `requestId` added. `message` adds where it failed, for logs; `normalized.text`
   * stays the server's, for display - `HTTP <status>` when the server sent none. `cause` is the server's `details.cause` - a 422's per-field
   * issues, `{ path, message, code }`.
   */
  protected async toResponseError(opts: { response: Response; url: string; verb: string }) {
    const { response, url, verb } = opts;
    const described = HttpWire.describeUrl({ url, status: response.status });

    return HttpResponseReader.toApplicationError({
      response,
      rootKey: this.settings.errorRootKey,
      context: `[${this.name}][${verb}] ${response.status} | ${described}`,
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
      shape?: THttpReadShape;
      method?: string;
      body?: THttpBody;
      /** Extras the route offers beside its rows, asked for by name (`x-request-extra`). */
      extra?: TExtraRequest;
      /** The rows alone: every default extra off (`-*`), for a read that only counts or probes. */
      isEveryDefaultOff?: boolean;
    } & IHttpCallOptions,
  ): Promise<IHttpReadResult<R>> {
    const url = this.buildUrl(opts);
    const headers = HttpWire.withExtraHeader({
      headers: opts.headers,
      extra: opts.extra,
      isEveryDefaultOff: opts.isEveryDefaultOff,
    });
    const response = await this.sendRequest({ ...opts, url, headers });

    if (!response.ok) {
      const result = await this.toResponseError({ response, url, verb: 'read' });
      throw result;
    }

    // A 204 or an empty body is no row; a list asked for of it still throws below.
    const parsed = await this.readJsonBody({ response, url, verb: 'read' });
    const { body, extra } = HttpResponseReader.readExtra({
      body: parsed,
      headers: response.headers,
    });
    const contentRange = response.headers.get(HTTP.Headers.CONTENT_RANGE) ?? undefined;
    const range = HttpResponseReader.parseContentRange({ header: contentRange });
    const data = HttpWire.unwrapRows<R>({ body, shape: opts.shape ?? HttpReadShapes.LIST, url });

    return {
      data,
      hasRange: range !== undefined,
      contentRange,
      total: range?.total,
      skip: range?.skip,
      dataLength: Array.isArray(data) ? data.length : data === null ? 0 : 1,
      extra,
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
      /** Extras the route answers beside its rows, asked for by name (`x-request-extra`). */
      extra?: TExtraRequest;
    } & IHttpCallOptions,
  ): Promise<IHttpWriteResult<R>> {
    const url = this.buildUrl(opts);
    const headers = HttpWire.withExtraHeader({ headers: opts.headers, extra: opts.extra });
    const response = await this.sendRequest({ ...opts, url, headers });

    if (!response.ok) {
      const result = await this.toResponseError({ response, url, verb: 'write' });
      throw result;
    }

    // A 204, or a route that answers nothing, has no body to parse.
    const parsed = await this.readJsonBody({ response, url, verb: 'write' });
    const { extra } = HttpResponseReader.readExtra({ body: parsed, headers: response.headers });
    // `extra` is only read off an object body, which carries the rows under `data`.
    const data = (extra && HttpResponseReader.isPlainObject(parsed) ? parsed.data : parsed) as R;

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
      ...(extra ? { extra } : {}),
    };
  }
}
