import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';

/** One host name: labels of letters, digits and hyphens joined by single dots - no empty label, no wildcard. */
const HOST_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

/** An IPv4 address, in any spelling a caller might write; the URL parser decides whether it is the address it looks like. */
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * An entry of `jwks.hosts.http`: a host (a name, an IPv4 address, or an IPv6 address in brackets) and an optional
 * `:port`. Nothing else: no scheme, path, userinfo or wildcard.
 */
const ENTRY_PATTERN = /^(?<host>\[[0-9a-f:.]+\]|[a-z0-9][a-z0-9.-]*)(?::(?<port>[0-9]{1,5}))?$/;

/** The port of an `http:` URL that names none. */
const DEFAULT_HTTP_PORT = '80';

/** `127.0.0.0/8`, as the URL parser writes an IPv4 host. */
const LOOPBACK_IPV4_PATTERN = /^127(?:\.\d{1,3}){3}$/;

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '[::1]']);

/**
 * Where a JWKS may be fetched from. A key set read over plain `http:` can be replaced on the way, and
 * whoever replaces it signs tokens that verify, so a JWKS URL is `https:` unless its host is loopback or
 * is listed in `jwks.hosts.http`. The one policy serves the JWKS verifier and the service-assertion
 * callers: both fetch a key set to decide who may call.
 *
 * The opt-in is an EXACT entry, never a pattern or a range: a host name, an IPv4 address, or an IPv6 address in
 * brackets, each optionally with a port (`identity-service`, `10.0.0.5:8080`, `[fd00::1]:8443`). An entry without a
 * port covers every port of that host; an entry with one covers that port only. An entry and a URL are both read by
 * the URL parser, so the two sides are compared in the form the parser gives them: `http://2130706433` is
 * `127.0.0.1`, and `http://[::ffff:10.0.0.5]` is `[::ffff:a00:5]`, which is not `10.0.0.5`.
 */
export class JWKSUrlPolicy {
  /**
   * Refuses an entry of `jwks.hosts.http` that is not exactly a host with an optional port, and answers the entries
   * in the form a URL is matched in: the host as the URL parser writes it (lower case), then `:port` when there is one.
   * An entry is valid only when `new URL('http://' + entry)` gives the same host back, and the same port.
   */
  static resolveHttpHosts(opts: { scope: string; hosts?: unknown }): ReadonlySet<string> {
    const { scope, hosts } = opts;

    if (hosts === undefined) {
      return new Set();
    }

    if (!Array.isArray(hosts)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] jwks.hosts.http must be a list of hosts`,
      });
    }

    const resolved = new Set<string>();

    for (const entry of hosts) {
      const canonical =
        typeof entry === 'string' ? JWKSUrlPolicy.canonicalEntry({ entry }) : undefined;

      if (canonical === undefined) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[${scope}] jwks.hosts.http holds ${JSON.stringify(entry)} | list exact hosts only: a name, an IPv4 address or an IPv6 address in brackets, with an optional :port, for example 'identity-service', '10.0.0.5:8080' or '[fd00::1]:8443' - no scheme, path, credentials, wildcard or range`,
        });
      }

      resolved.add(canonical);
    }

    return resolved;
  }

  /** The canonical form of one entry, or `undefined` when it is not exactly a host with an optional port. */
  private static canonicalEntry(opts: { entry: string }): string | undefined {
    const matched = ENTRY_PATTERN.exec(opts.entry.trim().toLowerCase());
    const { host, port } = matched?.groups ?? {};

    if (host === undefined) {
      return undefined;
    }

    // A name has labels of its own shape; an IPv4 or an IPv6 address is judged by the parser alone, below.
    const isAddress = host.startsWith('[') || IPV4_PATTERN.test(host);

    if (!isAddress && !HOST_NAME_PATTERN.test(host)) {
      return undefined;
    }

    const parsed = JWKSUrlPolicy.parseHttp({
      authority: port === undefined ? host : `${host}:${port}`,
    });

    // The host must be what the parser makes of it: `2130706433`, `0x7f000001`, `1.2.3`, `010.0.0.5` and
    // `[::ffff:10.0.0.5]` are spellings the parser rewrites, so none of them is the host it looks like.
    if (parsed === undefined || parsed.hostname !== host) {
      return undefined;
    }

    if (port === undefined) {
      return host;
    }

    // The parser drops the default port, so `:80` reads back as no port; a port is valid only as the parser keeps it.
    const kept = parsed.port === '' ? DEFAULT_HTTP_PORT : parsed.port;

    if (kept !== port || Number(port) < 1) {
      return undefined;
    }

    return `${host}:${port}`;
  }

  /** `http://<authority>` through the URL parser, or `undefined` when it refuses it. */
  private static parseHttp(opts: { authority: string }): URL | undefined {
    try {
      return new URL(`http://${opts.authority}`);
      // eslint-disable-next-line venizia/no-silent-catch -- an authority the parser refuses is not a host: the caller refuses the entry
    } catch {
      return undefined;
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

    // An entry without a port covers every port; one with a port covers that port only (an `http:` URL with none is on 80).
    const port = parsed.port === '' ? DEFAULT_HTTP_PORT : parsed.port;

    if (
      JWKSUrlPolicy.isLoopback(parsed.hostname) ||
      allowed.has(parsed.hostname) ||
      allowed.has(`${parsed.hostname}:${port}`)
    ) {
      return parsed;
    }

    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: `[${scope}] ${label} uses http: and the host '${parsed.hostname}' is not allowed | use https, or list the host in jwks.hosts.http`,
    });
  }
}
