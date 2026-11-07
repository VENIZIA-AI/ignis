import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';

/** One host name of `jwks.hosts.http`: labels of letters, digits and hyphens joined by single dots - no empty label, no port, no scheme, no wildcard, no address literal. */
const HOST_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

/** An IPv4 address: an entry of `jwks.hosts.http` is a name, and an address is not one. */
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** `127.0.0.0/8`, as the URL parser writes an IPv4 host. */
const LOOPBACK_IPV4_PATTERN = /^127(?:\.\d{1,3}){3}$/;

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '[::1]']);

/**
 * Where a JWKS may be fetched from. A key set read over plain `http:` can be replaced on the way, and
 * whoever replaces it signs tokens that verify, so a JWKS URL is `https:` unless its host is loopback or
 * is listed by name in `jwks.hosts.http`. The one policy serves the JWKS verifier and the service-assertion
 * callers: both fetch a key set to decide who may call.
 *
 * The opt-in is by host NAME, never by address range: what a name resolves to can change, and the choice to
 * trust a name is the operator's. The port is ignored, so `identity-service` covers every port.
 */
export class JWKSUrlPolicy {
  /** Refuses an entry of `jwks.hosts.http` that is not a bare host name, and answers the entries lower-cased. */
  static resolveHttpHosts(opts: { scope: string; hosts?: unknown }): ReadonlySet<string> {
    const { scope, hosts } = opts;

    if (hosts === undefined) {
      return new Set();
    }

    if (!Array.isArray(hosts)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] jwks.hosts.http must be a list of host names`,
      });
    }

    const resolved = new Set<string>();

    for (const entry of hosts) {
      const name = typeof entry === 'string' ? entry.trim().toLowerCase() : '';

      // The name must be what the URL parser makes of it: `2130706433`, `0x7f000001` and `1.2.3` are addresses the parser
      // rewrites (to `127.0.0.1`, `1.2.0.3`), so none of them is the name it looks like.
      if (
        !HOST_NAME_PATTERN.test(name) ||
        IPV4_PATTERN.test(name) ||
        !JWKSUrlPolicy.isParsedAsItself({ name })
      ) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[${scope}] jwks.hosts.http holds ${JSON.stringify(entry)} | list host names only: no port, scheme, wildcard or address, for example 'identity-service'`,
        });
      }

      resolved.add(name);
    }

    return resolved;
  }

  /** Whether `http://<name>` has `<name>` as its host once the URL parser has had its say. */
  private static isParsedAsItself(opts: { name: string }): boolean {
    try {
      return new URL(`http://${opts.name}`).hostname === opts.name;
      // eslint-disable-next-line venizia/no-silent-catch -- a name the parser refuses is not a host name: the caller refuses the entry
    } catch {
      return false;
    }
  }

  /** Whether the URL parser's hostname is a loopback one: `localhost`, `127.0.0.0/8` or `::1`. */
  static isLoopback(hostname: string): boolean {
    return LOOPBACK_HOSTS.has(hostname) || LOOPBACK_IPV4_PATTERN.test(hostname);
  }

  /**
   * Parses a JWKS URL and refuses it unless it is `https:`, or `http:` to a loopback host or a host listed in
   * `jwks.hosts.http`. Only the host name goes into the message: a URL may carry credentials.
   */
  static assertUrl(opts: { scope: string; label: string; url: string; hosts?: unknown }): URL {
    const { scope, label, url } = opts;

    let parsed: URL;

    try {
      parsed = new URL(url);
      // eslint-disable-next-line venizia/no-silent-catch -- the refusal below names the key and withholds the URL, which may carry credentials
    } catch {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] ${label} is not a valid URL`,
      });
    }

    if (parsed.protocol === 'https:') {
      return parsed;
    }

    if (parsed.protocol !== 'http:') {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] ${label} must use https | scheme: ${parsed.protocol}`,
      });
    }

    const allowed = JWKSUrlPolicy.resolveHttpHosts({ scope, hosts: opts.hosts });

    if (JWKSUrlPolicy.isLoopback(parsed.hostname) || allowed.has(parsed.hostname)) {
      return parsed;
    }

    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: `[${scope}] ${label} uses http: and the host '${parsed.hostname}' is not allowed | use https, or list the host name in jwks.hosts.http`,
    });
  }
}
