import { Hono } from 'hono';
import type { Env, Schema } from 'hono';

/** What builds one router. `strict` is Hono's trailing-slash mode, passed through as given. */
export type TRouterFactory = <
  AppEnv extends Env,
  AppSchema extends Schema,
  BasePath extends string,
>(opts: {
  strict: boolean;
}) => Hono<AppEnv, AppSchema, BasePath>;

/**
 * Where `RestApplication` gets its two routers: a plain `Hono` until the OpenAPI layer registers `OpenAPIHono`
 * when its own module loads (`AbstractRestController`). ESM evaluates every import before an application is
 * constructed, so the registration precedes the first router. Not exported from the package.
 */
export class RouterFactories {
  private static openApi?: TRouterFactory;

  /** Called once by the OpenAPI layer at module load. A second call replaces the first. */
  static registerOpenApi(opts: { factory: TRouterFactory }): void {
    this.openApi = opts.factory;
  }

  /** A test seam: back to the plain-`Hono` default. */
  static reset(): void {
    this.openApi = undefined;
  }

  /** True once the OpenAPI layer registered itself, i.e. `create` builds an `OpenAPIHono`. */
  static isOpenApiRegistered(): boolean {
    return this.openApi !== undefined;
  }

  private static createPlain<
    AppEnv extends Env,
    AppSchema extends Schema,
    BasePath extends string,
  >(opts: { strict: boolean }): Hono<AppEnv, AppSchema, BasePath> {
    return new Hono<AppEnv, AppSchema, BasePath>({ strict: opts.strict });
  }

  static create<AppEnv extends Env, AppSchema extends Schema, BasePath extends string>(opts: {
    strict: boolean;
  }): Hono<AppEnv, AppSchema, BasePath> {
    const factory: TRouterFactory = this.openApi ?? RouterFactories.createPlain;

    return factory<AppEnv, AppSchema, BasePath>({ strict: opts.strict });
  }
}
