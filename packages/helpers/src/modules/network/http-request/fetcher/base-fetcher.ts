import { RedactUtility } from '@/common/redact';
import { DurationMultipliers } from '@/common/constants/duration';
import { HTTP, type THttpMethod } from '@/common/constants/http';
import { getError } from '@/modules/error';
// The leaf file, never the logger BARREL: that barrel reaches `node:module` and would drag this
// browser-pure fetcher contract with it.
import type { ILogger } from '@/modules/logger/common/types';
import { UrlSafetyDefaults } from '@/modules/network/utilities/url-safety/common/constants';
import {
  UrlFetchError,
  UrlSafetyErrors,
} from '@/modules/network/utilities/url-safety/common/errors';
import type { IUrlSafetyPolicy } from '@/modules/network/utilities/url-safety/common/types';
import { RetryHelper } from '@/modules/retry/helper';
import type { z } from 'zod';
import { type TFetcherVariant } from '../common';
import { BodyLimit } from './common/body-limit';
import { FetchSchemaError, type IFetchSchemaIssue } from './common/errors';
import type { IFetchGuard, IFetchGuardRoute } from './common/guard';
import { FetchRequestContext } from './common/request-context';
import type {
  IFetchParsed,
  IFetchRetryOptions,
  IFetcherDefaults,
  IFetcherHooks,
  TFetchHeaders,
} from './common/types';
import { FetchHeaders, FetchRedirects, FetchRetry, FetchStatus } from './common/utilities';

/** The attempts a call makes when its `retry` names no `maxAttempts` (the retry helper's own default). */
const DEFAULT_MAX_ATTEMPTS = 3;

/** What a fetcher calls on the logger it is handed, so a host logger with only these two (a browser app's) is accepted as is. */
export type TFetcherLogger = Pick<ILogger, 'debug' | 'info'>;

/** Options every fetcher accepts. `timeout` is in milliseconds and counts per attempt; other keys pass through to the underlying client. */
export interface IRequestOptions {
  url: string;
  method?: THttpMethod;
  params?: Record<string, unknown>;
  /** Merged over the fetcher's default headers, header by header; a `null` or `undefined` value removes a default. */
  headers?: TFetchHeaders;
  body?: unknown;
  signal?: AbortSignal;
  timeout?: number;
  /** Presence turns retrying on; replaces the fetcher's default retry whole. `{ maxAttempts: 1 }` stops it. */
  retry?: IFetchRetryOptions;
  /** Presence turns the url guard on (`{}` is the default policy). A fetcher default guard can be replaced here, never removed. */
  guard?: IUrlSafetyPolicy;
  /** The body is cut off, and the call fails, once it crosses this many bytes. */
  maxBytes?: number;
  /** Redirects followed by hand; `0` hands back the 3xx as a `UrlFetchError`. Unset: the client follows (a guard follows 3). */
  maxRedirects?: number;
  /**
   * Which statuses are an answer; any other throws a `UrlFetchError`. A list ADDS to 2xx (`[HTTP.ResultCodes.RS_4.NotFound]`
   * is 2xx or 404); a function decides alone. Unset, only 2xx.
   */
  acceptStatus?: ReadonlyArray<number> | ((status: number) => boolean);
  /** The body is parsed with it, and the call answers `{ data, status, headers, response }`. */
  schema?: z.ZodType;
  [extra: symbol | string]: unknown;
}

/** The answer one exchange with the server gave, in the terms the pipeline needs, whichever client made it. */
export interface IFetchExchange<RS> {
  response: RS;
  status: number;
  statusText: string;
  headers: Headers;
  /** Frees the socket of a body nobody will read (a redirect, a refused status). */
  discard(): Promise<void>;
  /** The body as JSON; throws a `SyntaxError` when it is not. */
  readJson(opts: { maxBytes?: number }): Promise<unknown>;
  /** The same answer with its body cut off at `maxBytes`. */
  capped(opts: { maxBytes: number }): RS;
}

/** One request to the network, after the hooks and the guard have had their say. */
export interface IFetchExchangeRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
  signal?: AbortSignal;
  /** The addresses the guard vetted: connect to these and no other. Empty: connect as the client would. */
  addresses: string[];
  /** A proxy the guard policy chose. */
  proxy?: string;
  /** Do not follow a redirect: the pipeline reads the 3xx and walks it. */
  isManualRedirect: boolean;
  maxBytes?: number;
  /** What the call carried that is the client's own (`credentials`, `httpsAgent`, ...). */
  extra: Record<string | symbol, unknown>;
}

/** Contract of an HTTP fetcher: `send` takes the method from the options, the verb methods fix it, and `getWorker` returns the underlying client (`W`). Without a `schema` a call answers the raw response `RS`; with one, `IFetchParsed`. */
export interface IFetchable<
  V extends TFetcherVariant,
  RQ extends IRequestOptions,
  RS,
  W = unknown,
> {
  send(opts: RQ & { schema?: undefined }, logger?: TFetcherLogger): Promise<RS>;
  send<S extends z.ZodType>(
    opts: RQ & { schema: S },
    logger?: TFetcherLogger,
  ): Promise<IFetchParsed<z.infer<S>, RS>>;

  get(opts: RQ & { schema?: undefined }, logger?: TFetcherLogger): Promise<RS>;
  get<S extends z.ZodType>(
    opts: RQ & { schema: S },
    logger?: TFetcherLogger,
  ): Promise<IFetchParsed<z.infer<S>, RS>>;

  post(opts: RQ & { schema?: undefined }, logger?: TFetcherLogger): Promise<RS>;
  post<S extends z.ZodType>(
    opts: RQ & { schema: S },
    logger?: TFetcherLogger,
  ): Promise<IFetchParsed<z.infer<S>, RS>>;

  put(opts: RQ & { schema?: undefined }, logger?: TFetcherLogger): Promise<RS>;
  put<S extends z.ZodType>(
    opts: RQ & { schema: S },
    logger?: TFetcherLogger,
  ): Promise<IFetchParsed<z.infer<S>, RS>>;

  patch(opts: RQ & { schema?: undefined }, logger?: TFetcherLogger): Promise<RS>;
  patch<S extends z.ZodType>(
    opts: RQ & { schema: S },
    logger?: TFetcherLogger,
  ): Promise<IFetchParsed<z.infer<S>, RS>>;

  delete(opts: RQ & { schema?: undefined }, logger?: TFetcherLogger): Promise<RS>;
  delete<S extends z.ZodType>(
    opts: RQ & { schema: S },
    logger?: TFetcherLogger,
  ): Promise<IFetchParsed<z.infer<S>, RS>>;

  query(opts: RQ & { schema?: undefined }, logger?: TFetcherLogger): Promise<RS>;
  query<S extends z.ZodType>(
    opts: RQ & { schema: S },
    logger?: TFetcherLogger,
  ): Promise<IFetchParsed<z.infer<S>, RS>>;

  getVariant(): V;
  getWorker(): W;
}

/** What one call settled to, before the verb overloads give it their types. */
type TFetchSettled<RS> = RS | IFetchParsed<unknown, RS>;

/** A call after the fetcher's defaults are applied. */
interface IResolvedCall {
  method: string;
  url: string;
  headers: Headers;
  body: unknown;
  signal?: AbortSignal;
  timeout?: number;
  retry?: IFetchRetryOptions;
  guard?: IUrlSafetyPolicy;
  maxBytes?: number;
  maxRedirects?: number;
  acceptStatus: (status: number) => boolean;
  schema?: z.ZodType;
  extra: Record<string | symbol, unknown>;
}

/**
 * The pipeline every fetcher shares: defaults, hooks, the url guard, redirects, the status check, the body cap, the
 * schema, retries. A concrete fetcher supplies the exchange with one client (`exchange`) and the shape of its urls and
 * bodies; `W` defaults to `unknown` so this stays free of `axios`.
 */
export abstract class AbstractNetworkFetchableHelper<
  V extends TFetcherVariant,
  RQ extends IRequestOptions,
  RS,
  W = unknown,
> implements IFetchable<V, RQ, RS, W> {
  protected name: string;
  protected variant: V;
  protected worker: W;
  protected defaults: IFetcherDefaults;
  protected hooks: IFetcherHooks;
  protected guardEngine?: IFetchGuard;

  constructor(opts: {
    name: string;
    variant: V;
    worker?: W;
    defaults?: IFetcherDefaults;
    hooks?: IFetcherHooks;
    /** The server half of the url guard (`UrlGuard`); a call that passes `guard` needs it. */
    guardEngine?: IFetchGuard;
  }) {
    this.name = opts.name;
    this.variant = opts.variant;
    this.defaults = opts.defaults ?? {};
    this.hooks = opts.hooks ?? {};
    this.guardEngine = opts.guardEngine;

    if (opts.worker !== undefined) {
      this.worker = opts.worker;
    }
  }

  /** One exchange with the server: the request as the pipeline decided it, the answer in the pipeline's terms. */
  protected abstract exchange(
    opts: IFetchExchangeRequest,
    logger?: TFetcherLogger,
  ): Promise<IFetchExchange<RS>>;

  /** The url of a call with its `params` written into the query string. */
  protected abstract buildUrl(opts: { url: string; params?: Record<string, unknown> }): string;

  /** Whether `body` can be sent again to a redirect target. */
  protected isReplayable(opts: { body: unknown }): boolean {
    const { body } = opts;

    return (
      body === undefined ||
      body === null ||
      typeof body === 'string' ||
      ArrayBuffer.isView(body) ||
      body instanceof ArrayBuffer ||
      (typeof Blob !== 'undefined' && body instanceof Blob) ||
      (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) ||
      Array.isArray(body) ||
      (typeof body === 'object' && Object.getPrototypeOf(body) === Object.prototype)
    );
  }

  /** What the request log says about a body: its size or its presence, never its content. */
  protected describeBody(opts: { body: unknown }): string | undefined {
    const { body } = opts;

    if (body === undefined || body === null) {
      return undefined;
    }

    return typeof body === 'string' ? `[body ${body.length} chars]` : '[body]';
  }

  /** Refuses a call the client cannot honour; `AxiosFetcher` refuses a guard it cannot pin. */
  protected assertCallSupported(_opts: {
    guard?: IUrlSafetyPolicy;
    extra: Record<string | symbol, unknown>;
  }): void {
    // Every call is supported by default.
  }

  /** What each attempt needs to know of the call. */
  private resolveCall(opts: {
    request: IRequestOptions;
    extra: Record<string | symbol, unknown>;
  }): IResolvedCall {
    const { request, extra } = opts;
    const guard = request.guard ?? this.defaults.guard;

    if (guard !== undefined && this.guardEngine === undefined) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${this.name}] A call with a guard needs the guard engine | pass guardEngine: UrlGuard (from @venizia/ignis-helpers) to the fetcher`,
      });
    }

    this.assertCallSupported({ guard, extra });

    const method = (request.method ?? HTTP.Methods.GET).toUpperCase();

    if (request.body !== undefined && (method === 'GET' || method === 'HEAD')) {
      throw getError({
        message: `[${this.name}] A ${method} request cannot carry a body | url: ${request.url}`,
      });
    }

    const policyTimeout = guard?.timeout ? DurationMultipliers.toMilliseconds(guard.timeout) : null;
    const timeout =
      request.timeout ??
      policyTimeout ??
      this.defaults.timeout ??
      (guard === undefined ? undefined : UrlSafetyDefaults.TIMEOUT_MILLISECONDS);

    const retry = request.retry ?? this.defaults.retry;

    if (
      retry !== undefined &&
      (retry.maxAttempts ?? DEFAULT_MAX_ATTEMPTS) > 1 &&
      !this.isReplayable({ body: request.body })
    ) {
      throw getError({
        message: `[${this.name}] A call with retry cannot carry a body that is sent once (a stream, a FormData) unless maxAttempts is 1 | url: ${request.url}`,
      });
    }

    return {
      method,
      url: this.buildUrl({ url: request.url, params: request.params }),
      headers: FetchHeaders.merge({ layers: [this.defaults.headers, request.headers] }),
      body: request.body,
      signal: request.signal,
      timeout,
      retry,
      guard,
      // A guarded call always caps what it reads: the fetcher reads the body itself on the schema path.
      maxBytes:
        request.maxBytes ??
        guard?.maxBytes ??
        this.defaults.maxBytes ??
        (guard === undefined ? undefined : UrlSafetyDefaults.MAX_BYTES),
      maxRedirects: request.maxRedirects ?? guard?.maxRedirects,
      acceptStatus: FetchStatus.toPredicate({ accept: request.acceptStatus }),
      schema: request.schema,
      extra,
    };
  }

  /** `AbortSignal` of one attempt: the caller's own, and the attempt's deadline. */
  private attemptSignal(opts: { call: IResolvedCall }): AbortSignal | undefined {
    const { call } = opts;
    const signals: AbortSignal[] = [];

    if (call.signal) {
      signals.push(call.signal);
    }

    if (call.timeout !== undefined && call.timeout > 0) {
      signals.push(AbortSignal.timeout(call.timeout));
    }

    if (signals.length === 0) {
      return undefined;
    }

    return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
  }

  /** The body of a refused status or a mismatch is gone; the typed error carries what is left of the answer. */
  private async refuseStatus<R>(opts: {
    exchange: IFetchExchange<R>;
    url: string;
  }): Promise<UrlFetchError<R>> {
    const { exchange, url } = opts;

    await exchange.discard();

    return new UrlFetchError<R>({
      message: `[fetch] Request failed | status: ${exchange.status} | url: ${url}`,
      status: exchange.status,
      url,
      headers: exchange.headers,
      response: exchange.response,
    });
  }

  /** The guard's verdict on one hop: the url to send and the addresses to pin; with no guard, the target as it is. */
  private async vetTarget(opts: {
    route: IFetchGuardRoute | undefined;
    target: URL;
    signal: AbortSignal | undefined;
  }): Promise<{ url: URL; addresses: string[] }> {
    const { route, target, signal } = opts;

    if (!route) {
      return { url: target, addresses: [] };
    }

    const vetted = await route.vet({ url: target.toString(), signal });

    return vetted;
  }

  /** One attempt: hook, guard, exchange (redirects walked by hand when asked), status, cap, schema. */
  private async runAttempt(opts: {
    call: IResolvedCall;
    attempt: number;
    logger?: TFetcherLogger;
    onRequest: (request: FetchRequestContext) => void;
  }): Promise<TFetchSettled<RS>> {
    const { call, attempt, logger } = opts;
    const startedAt = Date.now();
    const request = new FetchRequestContext({
      method: call.method,
      url: call.url,
      headers: new Headers(call.headers),
      attempt,
    });

    opts.onRequest(request);
    await this.hooks.onRequest?.(request);

    const signal = this.attemptSignal({ call });
    const route: IFetchGuardRoute | undefined =
      call.guard === undefined ? undefined : this.guardEngine?.createRoute({ policy: call.guard });
    const isManual = route !== undefined || call.maxRedirects !== undefined;
    const maxRedirects = call.maxRedirects ?? UrlSafetyDefaults.MAX_REDIRECTS;

    let method = call.method;
    let body = call.body;
    let headers = request.headers;
    let target = this.parseUrl({ url: request.url });
    let exchange: IFetchExchange<RS> | undefined;

    logger?.debug(
      '[%s] URL: %s | Props: %s | Timeout: %s',
      'send',
      request.url,
      RedactUtility.redactSecrets({
        value: {
          method,
          headers: Object.fromEntries(headers),
          body: this.describeBody({ body }),
        },
      }),
      call.timeout,
    );

    try {
      for (let hop = 0; hop <= (isManual ? maxRedirects : 0); hop += 1) {
        const vetted = await this.vetTarget({ route, target, signal });

        const sent = await this.exchange(
          {
            method,
            url: vetted.url,
            headers,
            body,
            signal,
            addresses: vetted.addresses,
            proxy: call.guard?.proxy,
            isManualRedirect: isManual,
            maxBytes: call.maxBytes,
            extra: call.extra,
          },
          logger,
        );

        exchange = sent;

        if (!isManual || !FetchRedirects.isRedirect({ status: exchange.status })) {
          break;
        }

        const location = exchange.headers.get(HTTP.Headers.LOCATION);

        // No redirect budget: the 3xx is the answer, unless the caller accepts that status as one.
        if (hop === maxRedirects && maxRedirects === 0) {
          if (call.acceptStatus(exchange.status)) {
            break;
          }

          await exchange.discard();
          throw new UrlFetchError<RS>({
            message: `[fetch] Redirect not followed | status: ${exchange.status} | maxRedirects: 0 | url: ${request.url}`,
            status: exchange.status,
            url: request.url,
            headers: exchange.headers,
            response: exchange.response,
            location: location ?? undefined,
          });
        }

        await exchange.discard();

        if (!location) {
          throw getError({
            error: UrlSafetyErrors.URL_REFUSED,
            message: `[fetch] Redirect carried no location | url: ${request.url}`,
          });
        }

        if (hop === maxRedirects) {
          throw getError({
            error: UrlSafetyErrors.URL_REFUSED,
            message: `[fetch] Too many redirects | max: ${maxRedirects} | url: ${request.url}`,
          });
        }

        const next = this.resolveLocation({
          location,
          from: target,
          status: exchange.status,
          url: request.url,
          headers: exchange.headers,
          response: exchange.response,
        });
        const isSameOrigin = next.origin === target.origin;

        if (FetchRedirects.becomesGet({ status: exchange.status, method })) {
          method = 'GET';
          body = undefined;
          headers = FetchHeaders.without({ headers, names: FetchRedirects.BODY_HEADERS });
        } else if (body !== undefined && !isSameOrigin) {
          throw getError({
            error: UrlSafetyErrors.URL_REFUSED,
            message: `[fetch] Redirect would replay the request body to another origin | from: ${target.origin} | to: ${next.origin}`,
          });
        } else if (body !== undefined && !this.isReplayable({ body })) {
          throw getError({
            error: UrlSafetyErrors.URL_REFUSED,
            message: `[fetch] Redirect would replay a body that cannot be sent twice | url: ${request.url}`,
          });
        }

        if (!isSameOrigin) {
          headers = FetchHeaders.only({ headers, names: FetchRedirects.CROSS_ORIGIN_HEADERS });
        }

        target = next;
      }
    } catch (error) {
      // A deadline or an abort wins over whatever the client made of it: a caller tells a timeout from its own cancel.
      if (signal?.aborted) {
        throw signal.reason;
      }

      throw error;
    }

    if (exchange === undefined) {
      throw getError({ message: `[fetch] No exchange was made | url: ${request.url}` });
    }

    try {
      await this.hooks.onResponse?.({
        request,
        status: exchange.status,
        headers: exchange.headers,
        durationMs: Date.now() - startedAt,
      });
    } catch (hookError) {
      // The hook failed the call; the body that was never read is released before the error goes on.
      await exchange.discard();
      throw hookError;
    }

    if (!call.acceptStatus(exchange.status)) {
      const refusal = await this.refuseStatus({ exchange, url: request.url });

      throw refusal;
    }

    return this.finish({ call, exchange, url: request.url });
  }

  /** The cap and the schema, once the status is accepted. */
  private async finish(opts: {
    call: IResolvedCall;
    exchange: IFetchExchange<RS>;
    url: string;
  }): Promise<TFetchSettled<RS>> {
    const { call, exchange, url } = opts;
    const { maxBytes, schema } = call;

    if (maxBytes !== undefined) {
      const declaredLength = BodyLimit.readDeclaredLength({ headers: exchange.headers });

      if (declaredLength > maxBytes) {
        await exchange.discard();
        throw getError({
          error: UrlSafetyErrors.URL_REFUSED,
          message: `[fetch] Body exceeds the cap | declared: ${declaredLength} | max: ${maxBytes}`,
        });
      }
    }

    if (schema === undefined) {
      return maxBytes === undefined ? exchange.response : exchange.capped({ maxBytes });
    }

    let value: unknown;

    try {
      const parsed = await exchange.readJson({ maxBytes });

      value = parsed;
    } catch (error) {
      if (!(error instanceof SyntaxError)) {
        throw error;
      }

      throw new FetchSchemaError({
        status: exchange.status,
        url,
        issues: [{ path: [], code: 'invalid_json' }],
      });
    }

    const parsed = schema.safeParse(value);

    if (!parsed.success) {
      const issues: IFetchSchemaIssue[] = parsed.error.issues.map((issue) => ({
        path: issue.path.map((part) => (typeof part === 'symbol' ? String(part) : part)),
        code: issue.code,
      }));

      throw new FetchSchemaError({ status: exchange.status, url, issues });
    }

    return {
      data: parsed.data,
      status: exchange.status,
      headers: exchange.headers,
      response: exchange.response,
    };
  }

  private parseUrl(opts: { url: string }): URL {
    try {
      return new URL(opts.url);
      // eslint-disable-next-line venizia/no-silent-catch -- rethrown below as a typed refusal that names the url
    } catch {
      throw getError({
        error: UrlSafetyErrors.URL_REFUSED,
        message: `[fetch] Malformed url | url: ${opts.url}`,
      });
    }
  }

  /** The absolute target of a redirect; a `Location` that is not a url is a typed error, never a bare `TypeError`. */
  private resolveLocation(opts: {
    location: string;
    from: URL;
    status: number;
    url: string;
    headers: Headers;
    response: RS;
  }): URL {
    try {
      return new URL(opts.location, opts.from);
      // eslint-disable-next-line venizia/no-silent-catch -- rethrown below as a typed error that carries the raw Location
    } catch {
      throw new UrlFetchError<RS>({
        message: `[fetch] Redirect location is not a valid url | status: ${opts.status} | url: ${opts.url}`,
        status: opts.status,
        url: opts.url,
        headers: opts.headers,
        response: opts.response,
        location: opts.location,
      });
    }
  }

  /** The whole call: retries around the attempts, and the one `onError` for the failure that ends it. */
  protected async perform(
    opts: RQ & { schema?: z.ZodType },
    logger?: TFetcherLogger,
  ): Promise<TFetchSettled<RS>> {
    const {
      url,
      method,
      params,
      headers,
      body,
      signal,
      timeout,
      retry,
      guard,
      maxBytes,
      maxRedirects,
      acceptStatus,
      schema,
      ...extra
    } = opts;
    const call = this.resolveCall({
      request: {
        url,
        method,
        params,
        headers,
        body,
        signal,
        timeout,
        retry,
        guard,
        maxBytes,
        maxRedirects,
        acceptStatus,
        schema,
      },
      extra,
    });
    let lastRequest: FetchRequestContext | undefined;
    let lastAttempt = 0;

    const run = (attempt: number) => {
      lastAttempt = attempt;

      return this.runAttempt({
        call,
        attempt,
        logger,
        onRequest: (request) => {
          lastRequest = request;
        },
      });
    };

    try {
      if (call.retry === undefined) {
        const single = await run(1);

        return single;
      }

      const { maxAttempts, maxTotalMs, backoff, shouldRetry, onRetry } = call.retry;

      const retried = await RetryHelper.executeWithRetry({
        operation: `${this.name}.${call.method}`,
        signal: call.signal,
        maxAttempts,
        maxTotalMs,
        backoff,
        shouldRetry: (context) => {
          // A server that asks for a longer wait than the backoff allows ends the retries: the last error is the answer.
          const asked = FetchRetry.readRetryAfterMs({ error: context.error });

          if (
            asked !== undefined &&
            asked > (backoff?.maxDelayMs ?? FetchRetry.DEFAULT_MAX_DELAY_MS)
          ) {
            return false;
          }

          return shouldRetry
            ? shouldRetry(context)
            : FetchRetry.isRetryable({ error: context.error, signal: call.signal });
        },
        getDelayMs: ({ error }) => FetchRetry.readRetryAfterMs({ error }),
        onRetry,
        execution: ({ attempt }) => run(attempt),
      });

      return retried;
    } catch (caught) {
      // The retry helper reports its own abort in its own words; the caller gets the reason it aborted with.
      const error = call.signal?.aborted ? call.signal.reason : caught;

      await this.hooks.onError?.({
        request:
          lastRequest ??
          new FetchRequestContext({
            method: call.method,
            url: call.url,
            headers: new Headers(call.headers),
            attempt: lastAttempt,
          }),
        error,
        attempt: lastAttempt,
      });

      throw error;
    }
  }

  getProtocol(url: string) {
    return url.startsWith('http:') ? HTTP.Protocols.HTTP : HTTP.Protocols.HTTPS;
  }

  getVariant() {
    return this.variant;
  }

  getWorker(): W {
    return this.worker;
  }

  send(opts: RQ & { schema?: undefined }, logger?: TFetcherLogger): Promise<RS>;
  send<S extends z.ZodType>(
    opts: RQ & { schema: S },
    logger?: TFetcherLogger,
  ): Promise<IFetchParsed<z.infer<S>, RS>>;
  send(opts: RQ & { schema?: z.ZodType }, logger?: TFetcherLogger): Promise<TFetchSettled<RS>> {
    return this.perform(opts, logger);
  }

  get(opts: RQ & { schema?: undefined }, logger?: TFetcherLogger): Promise<RS>;
  get<S extends z.ZodType>(
    opts: RQ & { schema: S },
    logger?: TFetcherLogger,
  ): Promise<IFetchParsed<z.infer<S>, RS>>;
  get(opts: RQ & { schema?: z.ZodType }, logger?: TFetcherLogger): Promise<TFetchSettled<RS>> {
    return this.perform({ ...opts, method: HTTP.Methods.GET }, logger);
  }

  post(opts: RQ & { schema?: undefined }, logger?: TFetcherLogger): Promise<RS>;
  post<S extends z.ZodType>(
    opts: RQ & { schema: S },
    logger?: TFetcherLogger,
  ): Promise<IFetchParsed<z.infer<S>, RS>>;
  post(opts: RQ & { schema?: z.ZodType }, logger?: TFetcherLogger): Promise<TFetchSettled<RS>> {
    return this.perform({ ...opts, method: HTTP.Methods.POST }, logger);
  }

  put(opts: RQ & { schema?: undefined }, logger?: TFetcherLogger): Promise<RS>;
  put<S extends z.ZodType>(
    opts: RQ & { schema: S },
    logger?: TFetcherLogger,
  ): Promise<IFetchParsed<z.infer<S>, RS>>;
  put(opts: RQ & { schema?: z.ZodType }, logger?: TFetcherLogger): Promise<TFetchSettled<RS>> {
    return this.perform({ ...opts, method: HTTP.Methods.PUT }, logger);
  }

  patch(opts: RQ & { schema?: undefined }, logger?: TFetcherLogger): Promise<RS>;
  patch<S extends z.ZodType>(
    opts: RQ & { schema: S },
    logger?: TFetcherLogger,
  ): Promise<IFetchParsed<z.infer<S>, RS>>;
  patch(opts: RQ & { schema?: z.ZodType }, logger?: TFetcherLogger): Promise<TFetchSettled<RS>> {
    return this.perform({ ...opts, method: HTTP.Methods.PATCH }, logger);
  }

  delete(opts: RQ & { schema?: undefined }, logger?: TFetcherLogger): Promise<RS>;
  delete<S extends z.ZodType>(
    opts: RQ & { schema: S },
    logger?: TFetcherLogger,
  ): Promise<IFetchParsed<z.infer<S>, RS>>;
  delete(opts: RQ & { schema?: z.ZodType }, logger?: TFetcherLogger): Promise<TFetchSettled<RS>> {
    return this.perform({ ...opts, method: HTTP.Methods.DELETE }, logger);
  }

  query(opts: RQ & { schema?: undefined }, logger?: TFetcherLogger): Promise<RS>;
  query<S extends z.ZodType>(
    opts: RQ & { schema: S },
    logger?: TFetcherLogger,
  ): Promise<IFetchParsed<z.infer<S>, RS>>;
  query(opts: RQ & { schema?: z.ZodType }, logger?: TFetcherLogger): Promise<TFetchSettled<RS>> {
    return this.perform({ ...opts, method: HTTP.Methods.QUERY }, logger);
  }
}
