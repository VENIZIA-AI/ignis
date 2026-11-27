// The types behind `TContextOf`. No barrel re-exports this module, and the package's `exports` map reaches none but
// the barrels: nothing here is public API.
import type { Context, Env } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { TJsonResponse } from './context';

/** What `req.valid()` can be asked for. */
export type TValidTarget = 'json' | 'query' | 'param' | 'header' | 'cookie' | 'form';

/** The output type of a zod schema, read from zod's own property; `unknown` for anything else. */
type TSchemaOutput<Schema> = Schema extends { _zod: { output: infer Output } } ? Output : unknown;

/** The declared request part; `unknown` for one the config does not declare. */
type TRequestPart<RouteConfig, Key extends string> = RouteConfig extends { request?: infer Request }
  ? Key extends keyof NonNullable<Request>
    ? NonNullable<NonNullable<Request>[Key]>
    : unknown
  : unknown;

type TJsonBodyOf<Body> = Body extends { content: { 'application/json': { schema: infer Schema } } }
  ? TSchemaOutput<Schema>
  : unknown;

type TFormBodyOf<Body> = Body extends {
  content: { 'multipart/form-data': { schema: infer Schema } };
}
  ? TSchemaOutput<Schema>
  : Body extends { content: { 'application/x-www-form-urlencoded': { schema: infer Schema } } }
    ? TSchemaOutput<Schema>
    : unknown;

/** What `req.valid(target)` answers for the route config. */
type TValidOf<RouteConfig, Target> = Target extends 'json'
  ? TJsonBodyOf<TRequestPart<RouteConfig, 'body'>>
  : Target extends 'form'
    ? TFormBodyOf<TRequestPart<RouteConfig, 'body'>>
    : Target extends 'query'
      ? TSchemaOutput<TRequestPart<RouteConfig, 'query'>>
      : Target extends 'param'
        ? TSchemaOutput<TRequestPart<RouteConfig, 'params'>>
        : Target extends 'header'
          ? TSchemaOutput<TRequestPart<RouteConfig, 'headers'>>
          : Target extends 'cookie'
            ? TSchemaOutput<TRequestPart<RouteConfig, 'cookies'>>
            : unknown;

/** The context members no route changes, computed once per environment. */
type TContextBase<RouteEnv extends Env> = Omit<Context<RouteEnv>, 'req' | 'json'>;
type TRequestBase<RouteEnv extends Env> = Omit<Context<RouteEnv>['req'], 'valid'>;

export interface IRouteRequest<RouteConfig, RouteEnv extends Env> extends TRequestBase<RouteEnv> {
  /** The validated request part, typed from the route's schema. */
  valid<Target extends TValidTarget>(target: Target): TValidOf<RouteConfig, Target>;
  /** A type of your own: it also keeps a context assignable to `TRouteContext` parameters. */
  valid<ValidType = unknown>(target: TValidTarget): ValidType;
}

export interface IRouteContext<RouteConfig, RouteEnv extends Env> extends TContextBase<RouteEnv> {
  req: IRouteRequest<RouteConfig, RouteEnv>;
  json<StatusCode extends ContentfulStatusCode = 200>(
    body: unknown,
    status?: StatusCode,
  ): TJsonResponse<unknown, StatusCode>;
}
