import { HTTP } from '@venizia/ignis-helpers/common';
import { getError, UrlPolicy } from '@venizia/ignis-helpers/core';

/**
 * Where a JWKS may be fetched from. A key set read over plain `http:` can be replaced on the way, and
 * whoever replaces it signs tokens that verify, so a JWKS URL is `https:` unless its host is loopback or
 * its origin is listed in `jwks.trusted`. The one policy serves the JWKS verifier and the service-assertion
 * callers: both fetch a key set to decide who may call.
 *
 * The opt-in is an EXACT origin, never a pattern or a range, in the form the URL parser writes it
 * (`http://identity-service`, `http://10.0.0.5:8080`, `http://[fd00::1]:8443`). The shape check is the url guard's own
 * (`UrlPolicy.resolveTrustedOrigins`), so a JWKS entry and a `policy.hosts.trusted` entry follow one rule.
 */
export class JWKSUrlPolicy {
  /** Refuses a `jwks.trusted` list that is not exactly a list of origins, and answers the origins as a set. */
  static resolveTrustedOrigins(opts: { scope: string; trusted?: unknown }): ReadonlySet<string> {
    return UrlPolicy.resolveTrustedOrigins({ ...opts, label: 'jwks.trusted' });
  }

  /** Whether the URL parser's hostname is a loopback one: `localhost`, `127.0.0.0/8` or `::1`. */
  static isLoopback(hostname: string): boolean {
    return UrlPolicy.isLoopbackHost({ hostname });
  }

  /**
   * Parses a JWKS URL and refuses it unless it is `https:`, or `http:` to a loopback host or an origin listed in
   * `jwks.trusted`. Only the host name goes into the message: a URL may carry credentials.
   */
  static assertUrl(opts: { scope: string; label: string; url: string; trusted?: unknown }): URL {
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

    const trusted = JWKSUrlPolicy.resolveTrustedOrigins({ scope, trusted: opts.trusted });

    // Nothing listens on port 0: a URL that names it is a mistake, and no origin should cover it.
    if (parsed.port === '0') {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] ${label} uses port 0 | the host is '${parsed.hostname}'`,
      });
    }

    if (JWKSUrlPolicy.isLoopback(parsed.hostname) || trusted.has(parsed.origin)) {
      return parsed;
    }

    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: `[${scope}] ${label} uses http: and the origin '${parsed.origin}' is not trusted | use https, or list the origin in jwks.trusted`,
    });
  }
}
