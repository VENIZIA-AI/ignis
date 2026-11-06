// The browser-pure half of the guard: a url and a literal address are decided with string and
// number work alone. Resolving a hostname needs `node:dns` and lives in `ingest.ts`, which this
// file must never import - `policy.ts` is re-exported from the `./core` subpath and is gated by
// `make purity`.

import { getError } from '@/modules/error';
import { UrlSafetyDefaults, UrlSchemes } from './common/constants';
import { UrlSafetyErrors } from './common/errors';
import type { IUrlSafetyPolicy } from './common/types';

/** Everything about a url that can be decided without touching the network. */
export class UrlPolicy {
  /** A dotted-quad that is not routable on the public internet. An unparseable input counts as non-public. */
  private static isNonPublicIPv4(opts: { address: string }): boolean {
    const parts = opts.address.split('.').map(Number);

    if (
      parts.length !== 4 ||
      parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    ) {
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

    if (octets.length !== 4 || !octets.every((octet) => /^\d{1,3}$/.test(octet))) {
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
   * only: a domain name is parsed as a bad IPv4 address and answers `true`.
   *
   * An IPv6 literal is expanded to its eight groups before it is classified, so every spelling of an
   * address gets the same answer. An address that carries an IPv4 one is judged by the IPv4 rules: v4-mapped
   * (`::ffff:0:0/96`), v4-compatible (`::a.b.c.d`), NAT64 (`64:ff9b::/96`) and 6to4 (`2002::/16`); a
   * `64:ff9b::` address reaches 169.254.169.254 through a NAT64 gateway just as the dotted form does.
   * Unspecified, loopback, unique local (`fc00::/7`), link-local (`fe80::/10`), multicast (`ff00::/8`),
   * documentation (`2001:db8::/32`), Teredo (`2001::/32`), the rest of `64:ff9b::/32` and the reserved `::/8` are non-public.
   */
  static isNonPublicAddress(opts: { address: string }): boolean {
    const normalized = opts.address.toLowerCase().split('%')[0];

    if (!normalized.includes(':')) {
      return UrlPolicy.isNonPublicIPv4({ address: normalized });
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
          (g0 & 0xfe00) === 0xfc00 || // unique local
          (g0 & 0xffc0) === 0xfe80 || // link-local
          (g0 & 0xff00) === 0xff00 || // multicast
          (g0 === 0x2001 && (g1 === 0xdb8 || g1 === 0)); // documentation and Teredo
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

    if (!allowedSchemes.includes(parsed.protocol)) {
      throw getError({
        error: UrlSafetyErrors.URL_REFUSED,
        message: `[assertSafeUrl] Disallowed scheme | scheme: ${parsed.protocol} | allowed: ${allowedSchemes.join(', ')}`,
      });
    }

    if (parsed.username !== '' || parsed.password !== '') {
      throw getError({
        error: UrlSafetyErrors.URL_REFUSED,
        message:
          '[assertSafeUrl] Url carries a username or a password | credentials do not belong in a url',
      });
    }

    if (policy?.allowedHosts && !policy.allowedHosts.includes(parsed.hostname)) {
      throw getError({
        error: UrlSafetyErrors.URL_REFUSED,
        message: `[assertSafeUrl] Host is not in the allow-list | host: ${parsed.hostname}`,
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
   * address, a host outside the allow-list, a malformed url, or too many hops. Retrying any of those
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
