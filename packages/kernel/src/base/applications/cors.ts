import { getError } from '@venizia/ignis-helpers/core';
import type { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ICORSOptions, TOrigin } from './common';

/**
 * A parsed origin pattern: `scheme://*.suffix[:port]` (`subdomain` true) or `scheme://host:*` (an exact
 * `host`, held in `suffix`). `port` is `null` when the pattern names none, a number as text for one port,
 * and `'*'` for any port.
 */
interface IOriginPattern {
  scheme: string;
  suffix: string;
  subdomain: boolean;
  port: string | null;
}

const ANY_PORT = '*';
const WILDCARD_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/(\*\.)?([a-z0-9.-]+)(?::(\d{1,5}|\*))?$/;
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PORT_NUMBER = /^[1-9]\d{0,4}$/;

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
   * Reads an origin pattern into its parts. Two shapes are allowed, and nothing else with a `*`:
   * `https://*.example.com[:port]`, where the `*` is the whole leftmost host label and at least two
   * labels follow it (`https://*.com` is refused); and `http://localhost:*`, an exact host whose port
   * is `*` for any port. The port of either shape may be `*`, as in `https://*.example.com:*`. The
   * scheme is required and kept for an exact comparison. An IPv6 host is not supported. Anything else
   * with a `*` throws, because such a pattern would never match and a hole in it is easy to miss.
   */
  static parseOriginPattern(opts: { pattern: string }): IOriginPattern {
    const { pattern } = opts;
    const parts = WILDCARD_PATTERN.exec(pattern);
    const [, scheme, subdomain, suffix, port] = parts ?? [];
    const labels = suffix?.split('.') ?? [];

    if (
      !scheme ||
      !suffix ||
      (subdomain ? labels.length < 2 : port !== ANY_PORT) ||
      !labels.every((label) => HOST_LABEL.test(label)) ||
      (port !== undefined && port !== ANY_PORT && (Number(port) < 1 || Number(port) > 65535))
    ) {
      throw getError({
        message: `[registerCors] configs.middlewares.cors.origin has an invalid wildcard '${pattern}' | only a subdomain wildcard in lower case ('https://*.example.com', 'https://*.example.com:8443') or an any-port wildcard ('http://localhost:*', 'https://*.example.com:*') is allowed, with at least two labels after a '*.'`,
      });
    }

    return { scheme, suffix, subdomain: !!subdomain, port: port ?? null };
  }

  /**
   * True when the request `origin` (the `Origin` header, a serialised origin) belongs to `pattern`: the
   * scheme is equal, the port is equal (or any number when the pattern says `*`), and the host is the
   * exact host, or ends the pattern's suffix after one or more labels of letters, digits and hyphens.
   * The apex (`https://example.com`), a longer host that merely ends the same (`evilexample.com`), a
   * host that merely contains it (`example.com.evil.net`, `localhost.evil.com:3000`) and a userinfo or
   * path trick (`https://evil.com@a.example.com`) all fail. A pattern without a port matches an origin
   * without one only, so `https://a.example.com:8443` does not match `https://*.example.com`; a `*`
   * port matches an origin with a port or without one.
   */
  static matchOriginPattern(opts: { pattern: IOriginPattern; origin: string }): boolean {
    const { pattern, origin } = opts;
    const head = `${pattern.scheme}://`;

    if (!origin.startsWith(head)) {
      return false;
    }

    let host = origin.slice(head.length);

    if (pattern.port === ANY_PORT) {
      const separator = host.lastIndexOf(':');

      if (separator !== -1) {
        const port = host.slice(separator + 1);

        if (!PORT_NUMBER.test(port) || Number(port) > 65535) {
          return false;
        }

        host = host.slice(0, separator);
      }
    } else if (pattern.port !== null) {
      const tail = `:${pattern.port}`;

      if (!host.endsWith(tail)) {
        return false;
      }

      host = host.slice(0, host.length - tail.length);
    }

    if (!pattern.subdomain) {
      return host === pattern.suffix;
    }

    const tail = `.${pattern.suffix}`;

    if (!host.endsWith(tail) || host.length <= tail.length) {
      return false;
    }

    return host
      .slice(0, host.length - tail.length)
      .split('.')
      .every((label) => HOST_LABEL.test(label));
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
