// The server half of the url guard: resolving a hostname needs `node:dns`, so nothing here may be re-exported from the
// `./core` subpath. A fetcher (browser-pure) is handed `UrlGuard` as its `guardEngine`.

import { DurationMultipliers } from '@/common/constants/duration';
import { getError } from '@/modules/error';
import { lookup } from 'node:dns/promises';
import type { IFetchGuardHop, IFetchGuardRoute } from '../../http-request/fetcher/common/guard';
import { UrlSafetyDefaults } from './common/constants';
import { UrlSafetyErrors } from './common/errors';
import type { IUrlSafetyPolicy } from './common/types';
import { UrlPolicy } from './policy';

/** One guarded call: it carries the trust of the redirect chain so far, so a hop after an untrusted one never enters a trusted private origin. */
class UrlGuardRoute implements IFetchGuardRoute {
  readonly timeoutMs: number | undefined;
  private isChainTrusted = true;
  private isFirstHop = true;

  constructor(
    private readonly policy: IUrlSafetyPolicy,
    // Passed in because this class is defined before `UrlGuard`, which owns the resolver.
    private readonly resolve: typeof UrlGuard.resolvePublicAddresses,
  ) {
    this.timeoutMs = policy.timeout
      ? (DurationMultipliers.toMilliseconds(policy.timeout) ?? undefined)
      : undefined;
  }

  async vet(opts: { url: string; signal?: AbortSignal }): Promise<IFetchGuardHop> {
    const { url, signal } = opts;
    const { policy } = this;

    let target: URL;

    if (this.isFirstHop) {
      // The first url: its shape, then its origin decides whether the chain starts trusted.
      target = UrlPolicy.assertSafeUrl({ url, policy });
      this.isChainTrusted = UrlPolicy.isTrustedOrigin({ origin: target.origin, policy });
      this.isFirstHop = false;
    } else {
      // Trust is entered only through a trusted hop: once a hop is not trusted, every later hop gets the full guard.
      const parsed = new URL(url);

      this.isChainTrusted =
        this.isChainTrusted && UrlPolicy.isTrustedOrigin({ origin: parsed.origin, policy });
      target = UrlPolicy.assertSafeUrl({ url, policy, isTrustedAllowed: this.isChainTrusted });
    }

    const addresses = await this.resolve({
      hostname: target.hostname,
      trusted: this.isChainTrusted,
      policy,
      signal,
    });

    // A proxy resolves the name itself, so there is nothing to pin: the caller chose it (`policy.proxy`).
    // A pinned https connection names the host for the certificate; a literal address has no name to verify.
    const tlsServerName =
      target.protocol === 'https:' && !UrlPolicy.isLiteralHost({ hostname: target.hostname })
        ? target.hostname
        : undefined;

    return { url: target, addresses: policy.proxy ? [] : addresses, tlsServerName };
  }
}

/**
 * The server half of the url guard, the one name for it. As a fetcher's engine: `new NativeFetcher({ ..., guardEngine: UrlGuard })`, then `guard: {}` (or a policy)
 * on a call. Per hop the host is resolved ONCE, every answer is checked, and the request connects to those addresses and
 * to no other, so a DNS answer that changes after the check (DNS rebinding) is never looked up again.
 */
export class UrlGuard {
  static createRoute(opts: { policy: IUrlSafetyPolicy }): IFetchGuardRoute {
    return new UrlGuardRoute(opts.policy, (resolveOpts) =>
      UrlGuard.resolvePublicAddresses(resolveOpts),
    );
  }

  /**
   * Resolves `hostname` once and returns every address it answered, refusing the host when ANY of them is non-public.
   * Checking only the first walks straight into a host that publishes one public A record beside an internal one.
   * An IP literal answers itself. `allowPrivateAddress` skips the check and returns an empty list: nothing to pin to.
   *
   * With `trusted` (the caller has judged the origin trusted AND every hop before it was trusted too) a private answer
   * is accepted, and the addresses are still returned to pin to. A cloud metadata address is accepted only when the trusted origin's host IS
   * that literal; a trusted host NAME that resolves to one is refused.
   */
  static async resolvePublicAddresses(opts: {
    hostname: string;
    trusted?: boolean;
    policy?: IUrlSafetyPolicy;
    signal?: AbortSignal;
  }): Promise<string[]> {
    const { hostname, trusted, policy, signal } = opts;

    if (policy?.allowPrivateAddress ?? UrlSafetyDefaults.ALLOW_PRIVATE_ADDRESS) {
      return [];
    }

    // `URL.hostname` keeps the brackets on an IPv6 literal; `lookup` does not accept them, and the
    // ENOTFOUND that follows reads as a transient DNS failure rather than the refusal it should be.
    const address = UrlPolicy.readHostAddress({ hostname });
    const addresses = await UrlGuard.withDeadline({
      work: lookup(address, { all: true }),
      signal,
    });

    if (!addresses.length) {
      throw getError({
        error: UrlSafetyErrors.URL_REFUSED,
        message: `[assertPublicHost] Host resolves to nothing | host: ${hostname}`,
      });
    }

    const isLiteral = UrlPolicy.isLiteralHost({ hostname });
    const offender = addresses.find((entry) =>
      trusted
        ? !isLiteral && UrlPolicy.isMetadataAddress({ address: entry.address })
        : UrlPolicy.isNonPublicAddress({ address: entry.address }),
    );

    if (offender) {
      throw getError({
        error: UrlSafetyErrors.URL_REFUSED,
        message: `[assertPublicHost] Host resolves to a non-public address | host: ${hostname} | address: ${offender.address}`,
      });
    }

    return addresses.map((entry) => entry.address);
  }

  /**
   * Rejects when ANY resolved address is non-public.
   *
   * A rebinding window remains when this is called on its own: the address can change between this check and a
   * later connect. a fetcher call with a `guard` closes it by connecting to the address it vetted.
   */
  static async assertPublicHost(opts: {
    hostname: string;
    trusted?: boolean;
    policy?: IUrlSafetyPolicy;
  }): Promise<void> {
    await UrlGuard.resolvePublicAddresses(opts);
  }

  /** Both halves, in the order they must run: shape first, then the network. */
  static async assertReachableUrl(opts: { url: string; policy?: IUrlSafetyPolicy }): Promise<URL> {
    const parsed = UrlPolicy.assertSafeUrl(opts);
    await UrlGuard.assertPublicHost({
      hostname: parsed.hostname,
      trusted: UrlPolicy.isTrustedOrigin({ origin: parsed.origin, policy: opts.policy }),
      policy: opts.policy,
    });

    return parsed;
  }

  /** Settles with `work`, or rejects with the signal's reason when the deadline passes first: a slow resolver must not outlive it. */
  private static async withDeadline<T>(opts: {
    work: Promise<T>;
    signal?: AbortSignal;
  }): Promise<T> {
    const { work, signal } = opts;

    if (!signal) {
      return work;
    }

    signal.throwIfAborted();

    const aborted = Promise.withResolvers<never>();
    const onAbort = () => aborted.reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      const settled = await Promise.race([work, aborted.promise]);

      return settled;
    } finally {
      signal.removeEventListener('abort', onAbort);
      // The lookup that lost keeps running; its late answer or error must not surface as an unhandled rejection. Nothing
      // is left to report: the caller already got the deadline's error.
      // eslint-disable-next-line @venizia/no-silent-catch -- the work lost the race; its outcome is irrelevant by now
      work.catch(() => undefined);
    }
  }
}
