import { getError } from '@venizia/ignis-helpers/core';
import type { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ICORSOptions } from './common';

export class CorsUtility {
  /**
   * Installs `configs.middlewares.cors` on the server when it is set and not disabled; with no config
   * nothing is installed. Called first in the default stack, so every response the framework produces
   * on its own - a bodyLimit 413, a body the request spy cannot parse, the error envelope - leaves
   * with the headers a browser needs to read it.
   */
  static registerCors(opts: { server: Hono<any, any, any>; options?: ICORSOptions }): void {
    const { server, options } = opts;

    if (!options || options.enable === false) {
      return;
    }

    const { origin, path, allowMethods, allowHeaders, maxAge, credentials, exposeHeaders } =
      options;

    const hasOrigin =
      typeof origin === 'function' || (Array.isArray(origin) ? origin.length > 0 : !!origin);
    if (!hasOrigin) {
      throw getError({
        message:
          '[registerCors] configs.middlewares.cors.origin is required | a string, a list of strings or a function',
      });
    }

    const origins = Array.isArray(origin) ? origin : [origin];
    if (credentials && origins.includes('*')) {
      throw getError({
        message:
          "[registerCors] configs.middlewares.cors.credentials cannot be combined with origin '*' | a browser refuses a wildcard origin on a credentialed request | list the origins instead",
      });
    }

    // Only the keys that are set: hono spreads over its defaults, so an `undefined` would erase one
    // (a missing `allowMethods` would then answer a preflight with no allowed methods).
    const settings = Object.fromEntries(
      Object.entries({
        origin,
        allowMethods,
        allowHeaders,
        maxAge,
        credentials,
        exposeHeaders,
      }).filter(([, value]) => value !== undefined),
    );

    server.use(path ?? '*', cors(settings as Parameters<typeof cors>[0]));
  }
}
