import { AbstractDataSource } from '@venizia/ignis-kernel/repository';
import { HTTP } from '@venizia/ignis-helpers/common';
import { NodeFetchNetworkRequest } from '@venizia/ignis-helpers/core';
import { getError } from '@venizia/ignis-helpers/core';
import type { IAuthToken, IHttpDataSourceSettings, IHttpReadResult } from './common/types';

/**
 * Both list shapes IGNIS itself answers with, told apart by structure.
 *
 * `x-request-count` decides it, and its DEFAULT is on (`rest/base.ts`: `?? 'true'`), so an IGNIS
 * list route answers the count envelope unless asked otherwise. This datasource asks for the bare
 * array, but a hand-written route that never reaches `normalizeCountData` can still answer the
 * envelope - so both are accepted rather than one assumed. Treating an envelope as a row is the
 * failure that reports one record where there were fifty, with no error anywhere.
 *
 * The envelope `count` is the rows of THAT response, never the total - the total is only ever in
 * `Content-Range`.
 *
 * `shape` is asked for rather than sniffed. Structure alone cannot tell an envelope from a record
 * that happens to carry a `data` column and a `count` column, and guessing wrong there unwraps a
 * row into whatever its `data` field held.
 */
const unwrapBody = <R>(opts: { body: unknown; shape: 'list' | 'one' }): R => {
  const { body, shape } = opts;

  if (shape === 'one' || Array.isArray(body)) {
    return body as R;
  }

  if (body && typeof body === 'object' && 'data' in body && 'count' in body) {
    return (body as { data: R }).data;
  }

  return body as R;
};
/** `items 0-24/137` -> `{ skip: 0, total: 137 }`. Absent or unparseable answers `undefined`, never a guess. */
const readContentRange = (opts: {
  header: string | null;
}): { skip: number; total: number } | undefined => {
  const { header } = opts;

  if (!header) {
    return undefined;
  }

  const match = header.match(/(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)/);
  if (!match) {
    return undefined;
  }

  return { skip: Number(match[1]), total: Number(match[3]) };
};

/**
 * A datasource whose transport is HTTP.
 *
 * A repository talks to a datasource, and `AbstractDataSource` is engine-neutral - its only required
 * member is `configure()`. So "a request to another IGNIS server" is a datasource in the same sense
 * Drizzle-over-Postgres is one: same role, different transport, and the same
 * `@venizia/ignis-filter` vocabulary on the way in.
 *
 * It targets the IGNIS REST contract - a list route that answers `Content-Range` - and promises
 * nothing about an arbitrary REST API. How a filter serialises and which header carries the total
 * are one API's CONVENTIONS; IGNIS talking to IGNIS is both ends speaking its own.
 */
export class HttpDataSource extends AbstractDataSource<IHttpDataSourceSettings> {
  override name: string;
  override settings: IHttpDataSourceSettings;
  /** A remote API publishes no schema to this process. An empty object where a caller expects table metadata is worse than nothing. */
  override schema = {} as never;

  /** The framework's own HTTP layer, not a bare `fetch`: timeout, abort, secret redaction and scoped logging come with it, and one HTTP path in the framework beats two. */
  protected network: NodeFetchNetworkRequest;

  constructor(opts: IHttpDataSourceSettings & { name?: string }) {
    super({ scope: opts.name ?? HttpDataSource.name });

    const { name = 'http', ...settings } = opts;
    this.name = name;
    this.settings = settings;
    this.network = new NodeFetchNetworkRequest({
      name,
      networkOptions: { baseUrl: settings.baseUrl },
    });
  }

  /** Nothing to open. Holding no connection is what makes this one safe to construct anywhere. */
  async configure(): Promise<void> {}

  /** No transactions over REST. The root probes capabilities rather than assuming them. */
  override getCapabilities() {
    return { transactions: false };
  }

  /** Explicit token first, resolver only when there is none - a caller that supplied one is never overridden by a lookup. */
  protected resolveAuthToken(): IAuthToken | undefined {
    return this.settings.authToken ?? this.settings.authTokenResolver?.();
  }

  /**
   * Built through `Headers` rather than a plain object, so a caller's value genuinely OVERRIDES a
   * default. Two spellings of one name in an object both survive the merge and `Headers` then
   * APPENDS them - `x-request-count: "false, true"` - which parses as neither.
   */
  protected buildHeaders(opts: { token?: IAuthToken }): Headers {
    const { token } = opts;
    const headers = new Headers();

    // Asked explicitly: the server default is the count envelope, and a list that answers rows is
    // one less shape to tell apart. Set FIRST so a caller can override it.
    headers.set(HTTP.Headers.REQUEST_COUNT_DATA, 'false');

    const configured = [...new Headers(this.settings.headers).entries()];
    for (const [name, value] of configured) {
      headers.set(name, value);
    }

    if (!token) {
      return headers;
    }

    headers.set(HTTP.Headers.AUTHORIZATION, `${token.type ?? 'Bearer'} ${token.value}`);

    // Only when there IS one. Setting it unconditionally sends the string "undefined", which a
    // server reads as a provider by that name.
    if (token.provider) {
      headers.set('x-auth-provider', token.provider);
    }

    return headers;
  }

  buildUrl(opts: { paths: Array<string>; query?: Record<string, unknown> }): string {
    const { paths, query } = opts;
    // Path joining belongs to the network helper - it already normalises leading slashes and
    // refuses an unset base url with a catalogued error.
    const url = new URL(this.network.getRequestUrl({ paths }));

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
   * One request, with the total read from `Content-Range` and REPORTED as absent when the header is
   * not there.
   *
   * Goes through {@link HttpDataSource.request}, so auth, the 401 hook and the single retry live in
   * ONE place - a second header-building path is where a guard gets forgotten.
   */
  /**
   * One request, answered RAW.
   *
   * `read` is about rows and cannot express a response that is not JSON - an export endpoint returns
   * bytes and a filename. Rather than invent a blob shape on the repository, whose contract is rows,
   * the transport stays reachable: a caller gets the `Response` and reads `.blob()` and
   * `content-disposition` itself.
   *
   * Auth, the 401 hook and the single retry apply here exactly as they do to `read`.
   */
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

  async read<R>(opts: {
    paths: Array<string>;
    query?: Record<string, unknown>;
    /** What the caller asked for. `one` is never unwrapped - see {@link unwrapBody}. */
    shape?: 'list' | 'one';
  }): Promise<IHttpReadResult<R>> {
    const response = await this.request(opts);

    if (!response.ok) {
      throw getError({
        statusCode: response.status,
        message: `[${this.name}][read] ${response.status} | ${this.buildUrl(opts)}`,
      });
    }

    const body = await response.json();
    const range = readContentRange({ header: response.headers.get(HTTP.Headers.CONTENT_RANGE) });
    const data = unwrapBody<R>({ body, shape: opts.shape ?? 'list' });

    return {
      data,
      hasRange: range !== undefined,
      total: range?.total,
      skip: range?.skip,
      dataLength: Array.isArray(data) ? data.length : 1,
    };
  }
}
