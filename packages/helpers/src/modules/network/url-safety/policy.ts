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
      parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)
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

  /**
   * An address that must never be reached with an untrusted url. Anything unrecognised answers
   * `true`: a guard that fails open on a string it cannot parse is not a guard.
   */
  static isNonPublicAddress(opts: { address: string }): boolean {
    const normalized = opts.address.toLowerCase().split('%')[0];

    if (!normalized.includes(':')) {
      return UrlPolicy.isNonPublicIPv4({ address: normalized });
    }

    // An IPv4 address wearing an IPv6 coat walks past every naive v6 check. Both spellings must be
    // unwrapped: `new URL` rewrites `::ffff:169.254.169.254` into the hex form `::ffff:a9fe:a9fe`,
    // so a dotted-quad-only check is green on a value the parser never actually produces.
    const dottedMapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)?.[1];
    if (dottedMapped) {
      return UrlPolicy.isNonPublicIPv4({ address: dottedMapped });
    }

    const hexMapped = /^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/.exec(normalized);
    if (hexMapped) {
      const high = Number.parseInt(hexMapped[1], 16);
      const low = Number.parseInt(hexMapped[2], 16);
      const dotted = [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');

      return UrlPolicy.isNonPublicIPv4({ address: dotted });
    }

    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') || // unique local
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') || // link-local
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    );
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
}

export { UrlSafetyDefaults, UrlSchemes };
export type { IUrlSafetyPolicy };
