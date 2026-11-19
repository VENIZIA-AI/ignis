// The server half of the guarded fetch: resolving a hostname needs `node:dns`, so nothing here may be re-exported from
// the `./core` subpath. A fetcher (browser-pure) is handed `UrlGuard` as its `guardEngine`.

import type { IFetchGuardHop, IFetchGuardRoute } from '../../http-request/fetcher/common/guard';
import type { IUrlSafetyPolicy } from './common/types';
import { UrlIngest } from './ingest';
import { UrlPolicy } from './policy';

/** One guarded call: it carries the trust of the redirect chain so far, so a hop after an untrusted one never enters a trusted private origin. */
class UrlGuardRoute implements IFetchGuardRoute {
  private isChainTrusted = true;
  private isFirstHop = true;

  constructor(private readonly policy: IUrlSafetyPolicy) {}

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

    const addresses = await UrlIngest.resolvePublicAddresses({
      hostname: target.hostname,
      trusted: this.isChainTrusted,
      policy,
      signal,
    });

    // A proxy resolves the name itself, so there is nothing to pin: the caller chose it (`policy.proxy`).
    return { url: target, addresses: policy.proxy ? [] : addresses };
  }
}

/**
 * The url guard as a fetcher's engine: `new NativeFetcher({ ..., guardEngine: UrlGuard })`, then `guard: {}` (or a policy)
 * on a call. Per hop the host is resolved ONCE, every answer is checked, and the request connects to those addresses and
 * to no other, so a DNS answer that changes after the check (DNS rebinding) is never looked up again.
 */
export class UrlGuard {
  static createRoute(opts: { policy: IUrlSafetyPolicy }): IFetchGuardRoute {
    return new UrlGuardRoute(opts.policy);
  }
}
