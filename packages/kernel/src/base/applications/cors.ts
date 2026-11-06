import { getError } from '@venizia/ignis-helpers/core';
import type { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ICORSOptions, TOrigin } from './common';

/** A parsed `scheme://*.suffix[:port]` origin pattern. `port` is `null` when the pattern names none. */
interface IOriginPattern {
  scheme: string;
  suffix: string;
  port: string | null;
}

const WILDCARD_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/\*\.([a-z0-9.-]+)(?::(\d{1,5}))?$/;
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export class CorsUtility {
  /**
   * True when `value` is a wildcard origin pattern and not a plain origin: it contains a `*` and is not
   * the bare `'*'`, which keeps its own meaning ("any origin").
   */
  static isOriginPattern(opts: { value: string }): boolean {
    const { value } = opts;

    return value !== '*' && value.includes('*');
  }

  /**
   * Reads `https://*.example.com` into its parts. The only wildcard allowed is the whole leftmost host
   * label, so the host has at least two labels after it (`https://*.com` is refused). The scheme is
   * required and the port is optional; both are kept for an exact comparison. Anything else with a
   * `*` throws, because such a pattern would never match and a hole in it is easy to miss.
   */
  static parseOriginPattern(opts: { pattern: string }): IOriginPattern {
    const { pattern } = opts;
    const parts = WILDCARD_PATTERN.exec(pattern);
    const [, scheme, suffix, port] = parts ?? [];
    const labels = suffix?.split('.') ?? [];

    if (
      !scheme ||
      !suffix ||
      labels.length < 2 ||
      !labels.every((label) => HOST_LABEL.test(label)) ||
      (port !== undefined && (Number(port) < 1 || Number(port) > 65535))
    ) {
      throw getError({
        message: `[registerCors] configs.middlewares.cors.origin has an invalid wildcard '${pattern}' | only a subdomain wildcard in lower case is allowed, as in 'https://*.example.com' or 'https://*.example.com:8443', with at least two labels after the '*.'`,
      });
    }

    return { scheme, suffix, port: port ?? null };
  }

  /**
   * True when the request `origin` (the `Origin` header, a serialised origin) belongs to `pattern`: the
   * scheme and the port are equal, and what stands for the `*` is one or more host labels of letters,
   * digits and hyphens. The apex (`https://example.com`), a longer host that merely ends the same
   * (`evilexample.com`), a host that merely contains it (`example.com.evil.net`) and a userinfo or path
   * trick (`https://evil.com@a.example.com`) all fail. A pattern without a port matches an origin
   * without one, so `https://a.example.com:8443` does not match `https://*.example.com`.
   */
  static matchOriginPattern(opts: { pattern: IOriginPattern; origin: string }): boolean {
    const { pattern, origin } = opts;
    const head = `${pattern.scheme}://`;
    const tail = `.${pattern.suffix}${pattern.port === null ? '' : `:${pattern.port}`}`;

    if (
      !origin.startsWith(head) ||
      !origin.endsWith(tail) ||
      origin.length <= head.length + tail.length
    ) {
      return false;
    }

    const labels = origin.slice(head.length, origin.length - tail.length).split('.');

    return labels.every((label) => HOST_LABEL.test(label));
  }

  /**
   * Turns an origin that holds a wildcard pattern into the function form Hono takes: it returns the
   * request origin when an entry matches (a plain entry by equality, a pattern by
   * {@link CorsUtility.matchOriginPattern}) and `null` otherwise. An origin with no wildcard pattern is
   * returned as it is, so the string, list and function forms behave as before.
   */
  static resolveOrigin(opts: { origin: TOrigin }): TOrigin {
    const { origin } = opts;

    if (typeof origin === 'function') {
      return origin;
    }

    const entries = Array.isArray(origin) ? origin : [origin];

    if (!entries.some((value) => CorsUtility.isOriginPattern({ value }))) {
      return origin;
    }

    const exact = new Set<string>();
    const patterns: IOriginPattern[] = [];

    for (const value of entries) {
      if (CorsUtility.isOriginPattern({ value })) {
        patterns.push(CorsUtility.parseOriginPattern({ pattern: value }));
      } else {
        exact.add(value);
      }
    }

    return (requestOrigin: string) => {
      if (
        exact.has(requestOrigin) ||
        patterns.some((pattern) =>
          CorsUtility.matchOriginPattern({ pattern, origin: requestOrigin }),
        )
      ) {
        return requestOrigin;
      }

      return null;
    };
  }

  /**
   * Installs `configs.middlewares.cors` on the server when it is set and not disabled; with no config
   * nothing is installed. Called first in the default stack, so every response the framework produces
   * on its own - a bodyLimit 413, a body the request spy cannot parse, the error envelope - leaves
   * with the headers a browser needs to read it.
   *
   * `origin` may hold a subdomain wildcard such as `https://*.example.com` (see
   * {@link CorsUtility.matchOriginPattern}); an invalid pattern, or the bare `'*'` together with
   * `credentials: true`, throws here and not on the first request.
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
        origin: CorsUtility.resolveOrigin({ origin }),
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
