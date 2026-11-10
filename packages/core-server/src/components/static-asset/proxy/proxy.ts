import type { BaseRestController, TRouteContext } from '@/base';
import { OpenApiResponses } from '@venizia/ignis-kernel';
import { z } from '@hono/zod-openapi';
import { HTTP, ResolverUtility, type TValueOrAsyncResolver } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { AssetProxyFailures, type TAssetProxyFailure } from '../common/constants';
import { AssetProxyErrors } from './errors';

/** The CORS answer the proxy gives. Left out, the proxy sets no CORS header at all, so an application-wide CORS middleware stays in charge. */
export interface IAssetProxyCors {
  /** The `access-control-allow-origin` value, e.g. `*` or one origin. */
  allowOrigin: string;

  /** @default ['content-type', 'x-amz-tagging'] */
  allowHeaders?: readonly string[];

  /** @default ['ETag', 'Content-Length', 'Content-Type', 'Content-Disposition'] */
  exposeHeaders?: readonly string[];
}

/**
 * A storage proxy in front of presigned URLs: a browser that cannot reach the storage endpoint (it is internal) sends
 * the presigned request to the application, which forwards it unchanged.
 *
 * The route carries NO authentication. The storage signature in the URL is the authentication, and the proxy forwards
 * the request untouched, so a request the storage would refuse is refused there. What the proxy adds is only a limit
 * on WHERE it forwards (`allowedPathPrefixes`) and on which headers it passes on.
 */
export interface IAssetProxyOptions {
  /** The flag. `false` (or an absent `proxy`) registers no proxy route. */
  enable: boolean;

  /** The storage endpoint requests are forwarded to, e.g. the internal host of the S3 service. Read per request. */
  upstreamEndpoint: TValueOrAsyncResolver<string>;

  /**
   * The route path under the controller's base path: requests to `{basePath}{path}/<storage path>` are forwarded.
   *
   * @default '/proxy'
   */
  path?: string;

  /**
   * The storage paths a request may reach, after dot segments are resolved: a path that does not start with one of these
   * is a 404 and is never forwarded. Absent, it is `/{bucket}/` of `controller.bucket`; with neither, registering the
   * controller throws, because a proxy open to the whole storage endpoint is not something to default to.
   */
  allowedPathPrefixes?: readonly string[];

  /**
   * The request headers passed on. Everything else is dropped, so a caller cannot add a header that was not signed.
   *
   * @default ['content-type', 'content-length', 'x-amz-tagging']
   */
  forwardRequestHeaders?: readonly string[];

  cors?: IAssetProxyCors;

  /**
   * Gives up on the storage after this long.
   *
   * @default 600_000
   */
  timeoutMs?: number;

  /**
   * Answers a failure of the proxy itself instead of the JSON error body: `PATH_REFUSED` (a storage path outside the allowed
   * prefixes) or `UPSTREAM_FAILED` (the storage did not answer). The caller of a proxy is a browser PUTting bytes, not an
   * application that branches on codes, so an application MAY answer a plain 404 / 502 here. Return `undefined` to keep the
   * default error answer. Its response carries no CORS header of its own: add what the browser needs.
   */
  errorResponse?: (opts: { reason: TAssetProxyFailure; request: Request }) => Response | undefined;
}

const DEFAULT_PATH = '/proxy';
const DEFAULT_FORWARD_HEADERS = ['content-type', 'content-length', 'x-amz-tagging'] as const;
const DEFAULT_ALLOW_HEADERS = ['content-type', 'x-amz-tagging'] as const;
const DEFAULT_EXPOSE_HEADERS = [
  'ETag',
  'Content-Length',
  'Content-Type',
  'Content-Disposition',
] as const;
const DEFAULT_TIMEOUT_MS = 600_000;
const DROPPED_RESPONSE_HEADERS = ['set-cookie', 'set-cookie2'] as const;

/** Forwards presigned storage requests under the limits of `IAssetProxyOptions`. */
export class AssetPresignProxy {
  /** The route path with exactly one leading slash and none at the end. */
  static normalizePath(opts: { path?: string }): string {
    const trimmed = (opts.path ?? DEFAULT_PATH).replace(/^\/+|\/+$/g, '');

    return `/${trimmed}`;
  }

  /** Throws when the options cannot be served safely, at registration rather than on the first request. */
  static assertOptions(opts: {
    name: string;
    proxy: IAssetProxyOptions;
    bucket?: TValueOrAsyncResolver<string>;
  }): void {
    const { name, proxy, bucket } = opts;

    if (!proxy.allowedPathPrefixes?.length && bucket === undefined) {
      throw getError({
        message: `[${name}] proxy needs controller.bucket or proxy.allowedPathPrefixes | a proxy open to the whole storage endpoint is refused`,
      });
    }

    for (const prefix of proxy.allowedPathPrefixes ?? []) {
      if (!prefix.startsWith('/') || !prefix.endsWith('/')) {
        throw getError({
          message: `[${name}] proxy.allowedPathPrefixes must start and end with a slash | value: ${prefix}`,
        });
      }
    }
  }

  /** Registers the proxy routes on a generated controller. Called after every built-in route, so a built-in wins a path collision. */
  static register(opts: {
    controller: BaseRestController;
    proxy: IAssetProxyOptions;
    bucket?: TValueOrAsyncResolver<string>;
  }): void {
    const { controller, proxy, bucket } = opts;
    const path = AssetPresignProxy.normalizePath({ path: proxy.path });
    const wildcard = `${path}/:wildcard{.+}`;
    const responses = OpenApiResponses.jsonResponse({ schema: z.object({}).optional() });

    const handler = async (ctx: TRouteContext) => {
      return AssetPresignProxy.forward({ request: ctx.req.raw, mountPath: path, proxy, bucket });
    };

    controller.defineRoute({ configs: { method: 'put', path: wildcard, responses }, handler });
    controller.defineRoute({ configs: { method: 'get', path: wildcard, responses }, handler });

    if (proxy.cors) {
      controller.defineRoute({
        configs: { method: 'options', path: wildcard, responses },
        handler,
      });
    }
  }

  /** The storage path of the request: what follows the mount path of the URL, dot segments already resolved by the URL parser. */
  private static resolveStoragePath(opts: { url: URL; mountPath: string }): string | undefined {
    const { url, mountPath } = opts;
    const marker = `${mountPath}/`;
    const index = url.pathname.indexOf(marker);

    if (index < 0) {
      return undefined;
    }

    // `url.pathname` is already normalised by the URL parser (`..` and `%2e%2e` are resolved), so the prefix check sees the real path.
    return `/${url.pathname.slice(index + marker.length)}`;
  }

  private static buildCorsHeaders(opts: { cors: IAssetProxyCors }): Headers {
    const { allowOrigin, exposeHeaders = DEFAULT_EXPOSE_HEADERS } = opts.cors;
    const headers = new Headers();
    headers.set('access-control-allow-origin', allowOrigin);
    headers.set('access-control-expose-headers', exposeHeaders.join(', '));

    return headers;
  }

  /** The prefixes a request may reach: the ones declared, else the bucket of the controller, read now. */
  private static async resolvePrefixes(opts: {
    proxy: IAssetProxyOptions;
    bucket?: TValueOrAsyncResolver<string>;
  }): Promise<readonly string[]> {
    const { proxy, bucket } = opts;

    if (proxy.allowedPathPrefixes) {
      return proxy.allowedPathPrefixes;
    }

    if (bucket === undefined) {
      return [];
    }

    const bucketName = await ResolverUtility.resolveValueAsync({ value: bucket });

    return [`/${bucketName}/`];
  }

  /** Forwards one request, or answers the preflight. A failure the proxy itself names is first offered to `proxy.errorResponse`. */
  static async forward(opts: {
    request: Request;
    mountPath: string;
    proxy: IAssetProxyOptions;
    bucket?: TValueOrAsyncResolver<string>;
  }): Promise<Response> {
    const { request, proxy } = opts;

    try {
      const result = await AssetPresignProxy.forwardUnchecked(opts);

      return result;
    } catch (error) {
      const reason = AssetPresignProxy.readFailure({ error });
      const answer = reason ? proxy.errorResponse?.({ reason, request }) : undefined;

      if (!answer) {
        throw error;
      }

      return answer;
    }
  }

  /** Which of the proxy's own failures this error is; any other error (a bug, an abort of the request) is not the proxy's to answer. */
  private static readFailure(opts: { error: unknown }): TAssetProxyFailure | undefined {
    const { error } = opts;
    const normalized: unknown =
      typeof error === 'object' && error !== null && 'normalized' in error
        ? error.normalized
        : undefined;
    const code = Reflect.get(Object(normalized), 'code');

    if (code === AssetProxyErrors.PATH_REFUSED.message.code) {
      return AssetProxyFailures.PATH_REFUSED;
    }

    if (code === AssetProxyErrors.UPSTREAM_FAILED.message.code) {
      return AssetProxyFailures.UPSTREAM_FAILED;
    }

    return undefined;
  }

  private static async forwardUnchecked(opts: {
    request: Request;
    mountPath: string;
    proxy: IAssetProxyOptions;
    bucket?: TValueOrAsyncResolver<string>;
  }): Promise<Response> {
    const { request, mountPath, proxy, bucket } = opts;
    const {
      cors,
      forwardRequestHeaders = DEFAULT_FORWARD_HEADERS,
      timeoutMs = DEFAULT_TIMEOUT_MS,
    } = proxy;
    const corsHeaders = cors ? AssetPresignProxy.buildCorsHeaders({ cors }) : new Headers();

    if (request.method === 'OPTIONS') {
      const headers = new Headers(corsHeaders);
      headers.set('access-control-allow-methods', 'GET, PUT, OPTIONS');
      headers.set(
        'access-control-allow-headers',
        (cors?.allowHeaders ?? DEFAULT_ALLOW_HEADERS).join(', '),
      );

      return new Response(null, { status: HTTP.ResultCodes.RS_2.NoContent, headers });
    }

    const storagePath = AssetPresignProxy.resolveStoragePath({
      url: new URL(request.url),
      mountPath,
    });
    const prefixes = await AssetPresignProxy.resolvePrefixes({ proxy, bucket });

    if (storagePath === undefined || !prefixes.some((prefix) => storagePath.startsWith(prefix))) {
      throw getError({ error: AssetProxyErrors.PATH_REFUSED });
    }

    const endpoint = await ResolverUtility.resolveValueAsync({ value: proxy.upstreamEndpoint });
    const upstream = new URL(endpoint);
    upstream.pathname = `${upstream.pathname.replace(/\/+$/, '')}${storagePath}`;
    upstream.search = new URL(request.url).search;

    const upstreamHeaders = new Headers();

    for (const name of forwardRequestHeaders) {
      const value = request.headers.get(name);

      if (value !== null) {
        upstreamHeaders.set(name, value);
      }
    }

    const isDownload = request.method === 'GET' || request.method === 'HEAD';
    const init: RequestInit & { duplex?: 'half' } = isDownload
      ? { method: request.method, headers: upstreamHeaders, redirect: 'manual' }
      : {
          method: request.method,
          headers: upstreamHeaders,
          redirect: 'manual',
          body: request.body,
          duplex: 'half',
        };

    let response: Response;

    try {
      const result = await fetch(upstream, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      response = result;
    } catch (error) {
      throw getError({ error: AssetProxyErrors.UPSTREAM_FAILED, cause: error });
    }

    const headers = new Headers(response.headers);

    for (const name of DROPPED_RESPONSE_HEADERS) {
      headers.delete(name);
    }

    for (const [name, value] of corsHeaders) {
      headers.set(name, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
