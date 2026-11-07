import { Hono } from 'hono';
import type { Env, Schema } from 'hono';

/** What builds one router. `strict` is Hono's trailing-slash mode, passed through as given. */
export type TRouterFactory = (opts: { strict: boolean }) => Hono<Env, Schema, string>;

/**
 * Where `RestApplication` gets its two routers. Not exported from the package: the seam exists so the
 * application base does not import `@hono/zod-openapi`, which loads zod (about 394 KB) and zod-to-openapi
 * (about 33 KB) at import time and cannot be tree-shaken, whether or not a route ever uses them.
 *
 * The default is a plain `Hono`. The OpenAPI layer registers `OpenAPIHono` when its own module loads
 * (`AbstractRestController`), so a program that has REST controllers gets the same routers it always had,
 * and a worker with none never pays for zod. ESM evaluates every import before the application is
 * constructed, so the registration is always in place by the time a router is built.
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

  private static createPlain(opts: { strict: boolean }): Hono<Env, Schema, string> {
    return new Hono({ strict: opts.strict });
  }

  static create<AppEnv extends Env, AppSchema extends Schema, BasePath extends string>(opts: {
    strict: boolean;
  }): Hono<AppEnv, AppSchema, BasePath> {
    const factory: TRouterFactory = this.openApi ?? RouterFactories.createPlain;

    return factory({ strict: opts.strict }) as unknown as Hono<AppEnv, AppSchema, BasePath>;
  }
}
