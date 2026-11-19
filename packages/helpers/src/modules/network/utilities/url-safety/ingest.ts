// The half `policy.ts` cannot do: resolving a hostname needs `node:dns`, so nothing here may be
// re-exported from the `./core` subpath.

import { getError } from '@/modules/error';
import { lookup } from 'node:dns/promises';
import { UrlSafetyDefaults } from './common/constants';
import { UrlSafetyErrors } from './common/errors';
import type { IUrlSafetyPolicy } from './common/types';
import { UrlPolicy } from './policy';

/** Checking an untrusted url's host without letting it reach inside the network: the half of the guard that resolves names. */
export class UrlIngest {
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
    const addresses = await UrlIngest.withDeadline({
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
   * later connect. {@link UrlIngest.fetchGuarded} closes it by connecting to the address it vetted.
   */
  static async assertPublicHost(opts: {
    hostname: string;
    trusted?: boolean;
    policy?: IUrlSafetyPolicy;
  }): Promise<void> {
    await UrlIngest.resolvePublicAddresses(opts);
  }

  /** Both halves, in the order they must run: shape first, then the network. */
  static async assertReachableUrl(opts: { url: string; policy?: IUrlSafetyPolicy }): Promise<URL> {
    const parsed = UrlPolicy.assertSafeUrl(opts);
    await UrlIngest.assertPublicHost({
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

    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    });

    try {
      const settled = await Promise.race([work, aborted]);

      return settled;
    } finally {
      signal.removeEventListener('abort', onAbort as () => void);
      // The lookup that lost keeps running; its late answer or error must not surface as an unhandled rejection. Nothing
      // is left to report: the caller already got the deadline's error.
      // eslint-disable-next-line venizia/no-silent-catch -- the work lost the race; its outcome is irrelevant by now
      work.catch(() => undefined);
    }
  }
}
