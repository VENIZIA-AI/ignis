// The browser-pure half of the guard: a url and a literal address are decided with string and
// number work alone. Resolving a hostname needs `node:dns` and lives in `ingest.ts`, which this
// file must never import - `policy.ts` is re-exported from the `./core` subpath and is gated by
// `make purity`.

import { HTTP } from '@/common/constants';
import { getError } from '@/modules/error';
import { UrlSafetyDefaults, UrlSchemes } from './common/constants';
import { UrlSafetyErrors } from './common/errors';
import type { IUrlSafetyPolicy } from './common/types';

/** Everything about a url that can be decided without touching the network. */
export class UrlPolicy {
  /** A dotted-quad that is not routable on the public internet. An unparseable input counts as non-public. */
  private static isNonPublicIPv4(opts: { address: string }): boolean {
    const texts = opts.address.split('.');

    // Canonical dotted decimal only: an octet with a leading zero (`0177`, which inet_aton reads as octal 127) or an
    // exponent (`1e2`) is read differently by different parsers, so it is refused rather than guessed at.
    if (texts.length !== 4 || !texts.every((text) => /^(0|[1-9]\d{0,2})$/.test(text))) {
      return true;
    }

    const parts = texts.map(Number);

    if (parts.some((part) => part > 255)) {
      return true;
    }

    const [first, second] = parts;

    return (
      first === 0 || // this host
      first === 10 || // private
      first === 127 || // loopback
      (first === 100 && second >= 64 && second <= 127) || // carrier-grade NAT
      (first === 169 && second === 254) || // link-local, and the cloud metadata address
      (first === 172 && second >= 16 && second <= 31) || // private
      (first === 192 && second === 0) || // IETF protocol assignments
      (first === 192 && second === 168) || // private
      (first === 198 && (second === 18 || second === 19)) || // benchmarking
      first >= 224 // multicast and reserved
    );
  }

  /** The four octets of a dotted quad as two IPv6 groups, or `null` when it is not one. */
  private static dottedToGroups(opts: { dotted: string }): number[] | null {
    const octets = opts.dotted.split('.');

    if (octets.length !== 4 || !octets.every((octet) => /^(0|[1-9]\d{0,2})$/.test(octet))) {
      return null;
    }

    const [first, second, third, fourth] = octets.map(Number);

    if ([first, second, third, fourth].some((octet) => octet > 255)) {
      return null;
    }

    return [(first << 8) | second, (third << 8) | fourth];
  }

  /**
   * The eight 16-bit groups of an IPv6 literal, whatever its spelling: `::` compression, leading zeros,
   * upper case and a trailing dotted quad (`::127.0.0.1`) all expand to the same groups. `null` for a
   * string that is not an IPv6 literal.
   */
  private static expandIPv6(opts: { address: string }): number[] | null {
    let text = opts.address;
    const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)?.[1];

    if (dotted) {
      const groups = UrlPolicy.dottedToGroups({ dotted });

      if (!groups) {
        return null;
      }

      text = `${text.slice(0, -dotted.length)}${groups[0].toString(16)}:${groups[1].toString(16)}`;
    }

    const halves = text.split('::');

    if (halves.length > 2) {
      return null;
    }

    const head = halves[0] === '' ? [] : halves[0].split(':');
    const tail = halves.length === 2 && halves[1] !== '' ? halves[1].split(':') : [];
    const missing = 8 - head.length - tail.length;

    if (halves.length === 1 ? missing !== 0 : missing < 1) {
      return null;
    }

    const groups = [
      ...head,
      ...new Array<string>(halves.length === 2 ? missing : 0).fill('0'),
      ...tail,
    ];

    return groups.every((group) => /^[\da-f]{1,4}$/.test(group))
      ? groups.map((group) => Number.parseInt(group, 16))
      : null;
  }

  /** The IPv4 rules applied to the address carried in two IPv6 groups. */
  private static isNonPublicEmbedded(opts: { high: number; low: number }): boolean {
    const { high, low } = opts;

    return UrlPolicy.isNonPublicIPv4({
      address: [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.'),
    });
  }

  /**
   * An address that must never be reached with an untrusted url. Anything unrecognised answers
   * `true`: a guard that fails open on a string it cannot parse is not a guard. Takes an IP literal
   * only, in canonical text (dotted decimal without leading zeros; any IPv6 spelling): a domain name or a non-canonical IPv4
   * such as `0177.0.0.1` answers `true`.
   *
   * An IPv6 literal is expanded to its eight groups before it is classified, so every spelling of an
   * address gets the same answer. An address that carries an IPv4 one is judged by the IPv4 rules: v4-mapped
   * (`::ffff:0:0/96`), v4-compatible (`::a.b.c.d`), NAT64 (`64:ff9b::/96`) and 6to4 (`2002::/16`); a
   * `64:ff9b::` address reaches 169.254.169.254 through a NAT64 gateway just as the dotted form does.
   * Unspecified, loopback, unique local (`fc00::/7`), link-local (`fe80::/10`), multicast (`ff00::/8`),
   * site-local (`fec0::/10`), documentation (`2001:db8::/32`, `3fff::/20`), the IETF protocol assignments `2001::/23` (Teredo among them), discard (`100::/64`), SRv6 (`5f00::/16`), the rest of `64:ff9b::/32` and the reserved `::/8` are non-public.
   */
  static isNonPublicAddress(opts: { address: string }): boolean {
    const normalized = opts.address.toLowerCase().split('%')[0];

    if (!normalized.includes(':')) {
      return UrlPolicy.isNonPublicIPv4({ address: normalized });
    }

    // The longest IPv6 text is 45 characters; a longer string is not an address, and the cap bounds the work below.
    if (normalized.length > 45) {
      return true;
    }

    const groups = UrlPolicy.expandIPv6({ address: normalized });

    if (!groups) {
      return true;
    }

    const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
    const leadingZeros = [g0, g1, g2, g3, g4].every((group) => group === 0);

    // The v4-mapped `::ffff:a.b.c.d` (new URL writes it as `::ffff:a9fe:a9fe`) and the v4-compatible `::a.b.c.d`
    // start with five zero groups. `::` and `::1` are the same shape, and their IPv4 reading (0.0.0.0, 0.0.0.1) is non-public.
    if (leadingZeros && (g5 === 0xffff || g5 === 0)) {
      return UrlPolicy.isNonPublicEmbedded({ high: g6, low: g7 });
    }

    // NAT64: the well-known /96 carries an IPv4 address; the rest of 64:ff9b::/32 (local-use /48 included) is not a
    // translation prefix a public host sits behind.
    if (g0 === 0x64 && g1 === 0xff9b) {
      return g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0
        ? UrlPolicy.isNonPublicEmbedded({ high: g6, low: g7 })
        : true;
    }

    return g0 === 0x2002 // 6to4: the IPv4 address is groups 1 and 2
      ? UrlPolicy.isNonPublicEmbedded({ high: g1, low: g2 })
      : (g0 & 0xff00) === 0 || // 0000::/8, reserved by IETF: nothing a public host sits on
          (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) || // discard-only 100::/64
          (g0 & 0xfe00) === 0xfc00 || // unique local
          (g0 & 0xffc0) === 0xfe80 || // link-local
          (g0 & 0xffc0) === 0xfec0 || // site-local, deprecated
          (g0 & 0xff00) === 0xff00 || // multicast
          g0 === 0x5f00 || // SRv6 segment identifiers
          (g0 === 0x3fff && (g1 & 0xf000) === 0) || // documentation 3fff::/20
          (g0 === 0x2001 && (g1 < 0x200 || g1 === 0xdb8)); // IETF protocol assignments 2001::/23 (Teredo, ORCHID, AMT, AS112, ...) and documentation
  }

  /** `127.0.0.0/8`, as the URL parser writes an IPv4 host. */
  private static readonly LOOPBACK_IPV4_PATTERN = /^127(?:\.\d{1,3}){3}$/;

  private static readonly LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '[::1]']);

  /** The addresses that mean "any local address", not a host: as the URL parser writes them. */
  private static readonly UNSPECIFIED_HOSTS: ReadonlySet<string> = new Set(['0.0.0.0', '[::]']);

  /** Whether the URL parser's hostname is a loopback one: `localhost`, `127.0.0.0/8` or `::1`. */
  static isLoopbackHost(opts: { hostname: string }): boolean {
    const { hostname } = opts;

    return UrlPolicy.LOOPBACK_HOSTS.has(hostname) || UrlPolicy.LOOPBACK_IPV4_PATTERN.test(hostname);
  }

  /** Whether the URL parser's hostname is an IP literal (a dotted quad or a bracketed IPv6), not a name. */
  static isLiteralHost(opts: { hostname: string }): boolean {
    const address = UrlPolicy.readHostAddress(opts);

    return /^[\d.]+$/.test(address) || address.includes(':');
  }

  /** The IPv4 metadata services: the link-local block (AWS, GCP, Azure, ...) and Alibaba's address. */
  private static isMetadataIPv4(opts: { address: string }): boolean {
    const { address } = opts;

    return address.startsWith('169.254.') || address === '100.100.100.200';
  }

  /**
   * An address a cloud metadata service answers on: `169.254.0.0/16` (`169.254.169.254` among them), `100.100.100.200`,
   * `fd00:ec2::254`, the IPv6 link-local block `fe80::/10`, and each IPv4 one written inside an IPv6 address
   * (v4-mapped, v4-compatible, NAT64, 6to4). A trusted host name never opens one of these; only a trusted origin whose
   * host IS the literal does. Anything unparseable answers `true`.
   */
  static isMetadataAddress(opts: { address: string }): boolean {
    const normalized = opts.address.toLowerCase().split('%')[0];

    if (!normalized.includes(':')) {
      return (
        !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) ||
        UrlPolicy.isMetadataIPv4({ address: normalized })
      );
    }

    const groups = normalized.length > 45 ? null : UrlPolicy.expandIPv6({ address: normalized });

    if (!groups) {
      return true;
    }

    const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
    const embedded = (high: number, low: number) =>
      UrlPolicy.isMetadataIPv4({
        address: [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.'),
      });

    if ([g0, g1, g2, g3, g4].every((group) => group === 0) && (g5 === 0xffff || g5 === 0)) {
      return embedded(g6, g7);
    }

    if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
      return embedded(g6, g7);
    }

    if (g0 === 0x2002) {
      return embedded(g1, g2);
    }

    const isAwsIPv6 =
      g0 === 0xfd00 &&
      g1 === 0x0ec2 &&
      [g2, g3, g4, g5, g6].every((group) => group === 0) &&
      g7 === 0x254;

    return (g0 & 0xffc0) === 0xfe80 || isAwsIPv6;
  }

  /**
   * Validates the trusted origins and answers them as a set. An entry is valid only when the URL parser writes the same
   * origin back, so a path, a query, credentials, upper case, a trailing slash, a default port, an odd IP spelling
   * (`http://2130706433`, `http://[::ffff:10.0.0.5]`) and a scheme other than http or https are refused, never
   * corrected or ignored. `0.0.0.0` and `[::]` are not hosts and are refused too.
   */
  static resolveTrustedOrigins(opts: {
    scope: string;
    trusted?: unknown;
    /** The config key the list came from, named in a refusal. */
    label?: string;
  }): ReadonlySet<string> {
    const { scope, trusted } = opts;
    const label = opts.label ?? 'policy.hosts.trusted';

    if (trusted === undefined) {
      return new Set();
    }

    if (!Array.isArray(trusted)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] ${label} must be a list of origins`,
      });
    }

    const resolved = new Set<string>();

    for (const entry of trusted) {
      if (typeof entry !== 'string' || !UrlPolicy.isOriginText({ entry })) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[${scope}] ${label} holds ${JSON.stringify(entry)} | list exact origins only, written as the URL parser writes them: 'https://cdn.example.com', 'http://10.0.0.5:8080' or 'http://[fd00::1]' - no path, query, credentials, trailing slash, upper case, default port or wildcard`,
        });
      }

      resolved.add(entry);
    }

    return resolved;
  }

  /** Whether `entry` is exactly an http or https origin as the URL parser writes it. */
  private static isOriginText(opts: { entry: string }): boolean {
    const { entry } = opts;

    let parsed: URL;

    try {
      parsed = new URL(entry);
      // eslint-disable-next-line venizia/no-silent-catch -- an entry the parser refuses is not an origin: the caller refuses it
    } catch {
      return false;
    }

    const isHttp = parsed.protocol === UrlSchemes.HTTP || parsed.protocol === UrlSchemes.HTTPS;

    // The parser lets `*` and other odd characters through a host; an origin names a host, never a pattern.
    const isPlainHost = /^(?:\[[0-9a-f:.]+\]|[a-z0-9][a-z0-9.-]*)$/.test(parsed.hostname);

    return (
      isHttp &&
      isPlainHost &&
      parsed.origin === entry &&
      !UrlPolicy.UNSPECIFIED_HOSTS.has(parsed.hostname) &&
      parsed.port !== '0'
    );
  }

  /**
   * Reads `policy.hosts`: its trusted origins, validated, and `strict`. A policy still carrying `allowedHosts` is refused:
   * ignoring it would widen "only these hosts" to "any public host".
   */
  static readHosts(opts: { policy?: IUrlSafetyPolicy; scope?: string }): {
    trusted: ReadonlySet<string>;
    strict: boolean;
  } {
    const { policy } = opts;
    const scope = opts.scope ?? 'readHosts';

    if (policy && 'allowedHosts' in policy) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] policy.allowedHosts was removed | use policy.hosts: { trusted: ['https://cdn.example.com'], strict: true }`,
      });
    }

    const hosts = policy?.hosts;
    const trusted = UrlPolicy.resolveTrustedOrigins({ scope, trusted: hosts?.trusted });
    const strict = hosts?.strict ?? false;

    if (strict && trusted.size === 0) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] policy.hosts.strict needs at least one trusted origin | nothing would pass`,
      });
    }

    return { trusted, strict };
  }

  /** Whether `origin` (as `new URL(...).origin` writes it) is one the policy trusts. */
  static isTrustedOrigin(opts: { origin: string; policy?: IUrlSafetyPolicy }): boolean {
    return UrlPolicy.readHosts({ policy: opts.policy }).trusted.has(opts.origin);
  }

  /** A bracketed IPv6 literal arrives as `[::1]`; the brackets are not part of the address. */
  static readHostAddress(opts: { hostname: string }): string {
    const { hostname } = opts;

    return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  }

  /**
   * A hostname that RESOLVES to a private address passes here on purpose - `UrlIngest` catches that,
   * and this half runs where `node:dns` does not exist.
   */
  static assertSafeUrl(opts: { url: string; policy?: IUrlSafetyPolicy }): URL {
    const { url, policy } = opts;
    const allowedSchemes = policy?.allowedSchemes ?? UrlSafetyDefaults.ALLOWED_SCHEMES;
    const allowPrivateAddress =
      policy?.allowPrivateAddress ?? UrlSafetyDefaults.ALLOW_PRIVATE_ADDRESS;

    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      throw getError({
        error: UrlSafetyErrors.URL_REFUSED,
        message: `[assertSafeUrl] Malformed url | url: ${url}`,
      });
    }

    // Before the trusted check: an origin carries no credentials, so `http://user:pw@vault` has a trusted origin.
    if (parsed.username !== '' || parsed.password !== '') {
      throw getError({
        error: UrlSafetyErrors.URL_REFUSED,
        message:
          '[assertSafeUrl] Url carries a username or a password | credentials do not belong in a url',
      });
    }

    const { trusted, strict } = UrlPolicy.readHosts({ policy, scope: 'assertSafeUrl' });

    // A trusted origin carries its own scheme and may be private: it skips the scheme and address checks below.
    if (trusted.has(parsed.origin)) {
      return parsed;
    }

    if (strict) {
      throw getError({
        error: UrlSafetyErrors.URL_REFUSED,
        message: `[assertSafeUrl] Origin is not trusted | origin: ${parsed.origin}`,
      });
    }

    if (!allowedSchemes.includes(parsed.protocol)) {
      throw getError({
        error: UrlSafetyErrors.URL_REFUSED,
        message: `[assertSafeUrl] Disallowed scheme | scheme: ${parsed.protocol} | allowed: ${allowedSchemes.join(', ')}`,
      });
    }

    const address = UrlPolicy.readHostAddress({ hostname: parsed.hostname });
    const isLiteralAddress = /^[\d.]+$/.test(address) || address.includes(':');

    if (!allowPrivateAddress && isLiteralAddress && UrlPolicy.isNonPublicAddress({ address })) {
      throw getError({
        error: UrlSafetyErrors.URL_REFUSED,
        message: `[assertSafeUrl] Url points at a non-public address | address: ${address}`,
      });
    }

    return parsed;
  }

  /**
   * True when the url will never be allowed, whatever happens next: a bad scheme, a non-public
   * address, an origin outside a strict trusted list, a malformed url, or too many hops. Retrying any of those
   * repeats the same rejection - drop the work instead.
   *
   * A timeout, a DNS failure or a 5xx answers `false`: those are worth another attempt.
   */
  static isRefusedError(opts: { error: unknown }): boolean {
    const source = opts.error as { normalized?: { code?: string } };

    return source?.normalized?.code === UrlSafetyErrors.URL_REFUSED.message.code;
  }
}

export { UrlSafetyDefaults, UrlSchemes };
export type { IUrlSafetyPolicy };
