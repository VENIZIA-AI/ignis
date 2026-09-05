import type { Hook, OpenAPIHono } from '@hono/zod-openapi';
import type { TDataRange } from '@/base/repositories/common/types';
import type { AnyType, TNullable, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import { executeWithPerformanceMeasure, toBoolean } from '@venizia/ignis-helpers/core';
import type { Env, Schema } from 'hono';
import { ResponseFormats } from '../common/constants';
import type { TResponseFormat } from '../common/constants';
import type {
  IAuthRouteConfig,
  IBindRouteOptions,
  IDefineRouteOptions,
  TRouteContext,
  TRouteHandler,
} from '../common/types';
import { AbstractRestController } from './abstract';

/** `Content-Range` of a page: inclusive `end`, and `records * /<total>` (no space) when the page is empty. */
const toContentRange = (opts: { range: TDataRange; count: number }): string => {
  const { range, count } = opts;
  const { start, end, total } = range;
  return count > 0 ? `records ${start}-${end}/${total}` : `records */${total}`;
};

/** Recommended base class for REST controllers with concrete bindRoute and defineRoute implementations. */
export abstract class BaseRestController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
  Definitions extends Record<string, IAuthRouteConfig> = Record<string, IAuthRouteConfig>,
> extends AbstractRestController<
  RouteEnv,
  RouteSchema,
  BasePath,
  ConfigurableOptions,
  Definitions
> {
  /** Runs a handler task under performance measurement (fixed logger/level/description). */
  measure<R>(opts: { scope: string; args: unknown; task: () => Promise<R> }) {
    return executeWithPerformanceMeasure({
      logger: this.logger,
      level: 'debug',
      scope: opts.scope,
      description: `execute ${opts.scope}`,
      args: opts.args,
      task: opts.task,
    });
  }

  /** Returns the full `{ count, data }` envelope, or just `data` when the client sent `x-request-count: false`; `X-Response-Count` is set either way. */
  normalizeCountData<
    ResponseSchema extends AnyType,
    RequestContext extends TRouteContext<RouteEnv> = TRouteContext<RouteEnv>,
    ResponseData extends {
      count: number;
      data?: TNullable<ResponseSchema>;
    } = { count: number; data?: TNullable<ResponseSchema> },
  >(opts: { context: RequestContext; payload: ResponseData }) {
    const { context, payload } = opts;
    const requestCountData = context.req.header(HTTP.Headers.REQUEST_COUNT_DATA) ?? 'true';
    const useCountData = toBoolean(requestCountData);

    context.header(HTTP.Headers.RESPONSE_COUNT_DATA, payload.count.toString());

    if (useCountData) {
      return payload;
    }

    return payload.data;
  }

  /** The one response call. Sets `X-Response-Format`, and with `range` (a list) also `Content-Range` - `payload.count` is the rows of THIS response, never the total - then normalizes count/data per the request-count header. */
  respond<R>(opts: {
    context: TRouteContext<RouteEnv>;
    format: TResponseFormat;
    payload: { count: number; data?: TNullable<R> };
    range?: TDataRange;
  }) {
    const { context, format, payload, range } = opts;

    if (range) {
      context.header(HTTP.Headers.CONTENT_RANGE, toContentRange({ range, count: payload.count }));
    }
    context.header(HTTP.Headers.RESPONSE_FORMAT, format);

    return this.normalizeCountData<R>({ context, payload });
  }

  /** The list headers without the body, for a list whose body is not a `{ count, data }` envelope: `Content-Range`, `X-Response-Count` = rows in THIS response, `X-Response-Format: array`. */
  setListHeaders(opts: { context: TRouteContext<RouteEnv>; range: TDataRange; count: number }) {
    const { context, range, count } = opts;

    context.header(HTTP.Headers.CONTENT_RANGE, toContentRange({ range, count }));
    context.header(HTTP.Headers.RESPONSE_COUNT_DATA, count.toString());
    context.header(HTTP.Headers.RESPONSE_FORMAT, ResponseFormats.ARRAY);
  }

  /** TRouteHandler's TRouteContext is a lightweight custom shape (different `json`/`req.valid` signatures) built on Hono's real Context, not a subtype of the RouteHandler `.openapi()` expects - genuinely different handler types bridged here. */
  toHonoHandler<ResponseType = unknown>(opts: { handler: TRouteHandler<ResponseType, RouteEnv> }) {
    return opts.handler as Parameters<OpenAPIHono<RouteEnv>['openapi']>[1];
  }

  /** Creates a fluent binding for registering a route (call .to() to attach handler). */
  bindRoute<RouteConfig extends IAuthRouteConfig>(opts: {
    configs: RouteConfig;
  }): IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath> {
    const routeConfigs = this.getRouteConfigs<RouteConfig>({ configs: opts.configs });

    return {
      configs: routeConfigs,
      to: ({ handler }) => {
        return {
          configs: routeConfigs,
          route: this.router.openapi(routeConfigs, this.toHonoHandler({ handler })),
        };
      },
    };
  }

  /** Defines and registers a route with its handler in a single call. */
  defineRoute<RouteConfig extends IAuthRouteConfig, ResponseType = unknown>(opts: {
    configs: RouteConfig;
    handler: TRouteHandler<ResponseType, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath> {
    const routeConfigs = this.getRouteConfigs<RouteConfig>({ configs: opts.configs });

    return {
      configs: routeConfigs,
      route: this.router.openapi(
        routeConfigs,
        this.toHonoHandler<ResponseType>({ handler: opts.handler }),
        opts.hook,
      ),
    };
  }

  /** Defines a JSX route that renders server-side HTML via c.html(). */
  defineJSXRoute<RouteConfig extends IAuthRouteConfig, ResponseType = unknown>(opts: {
    configs: RouteConfig;
    handler: TRouteHandler<ResponseType, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath> {
    const routeConfigs = this.getJSXRouteConfigs<RouteConfig>({ configs: opts.configs });

    return {
      configs: routeConfigs,
      route: this.router.openapi(
        routeConfigs,
        this.toHonoHandler<ResponseType>({ handler: opts.handler }),
        opts.hook,
      ),
    };
  }
}
