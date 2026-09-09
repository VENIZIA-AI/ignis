// The half `policy.ts` cannot do: resolving a hostname needs `node:dns`, so nothing here may be
// re-exported from the `./core` subpath.

import { DurationMultipliers } from '@/common/constants/duration';
import { getError } from '@/modules/error';
import { lookup } from 'node:dns/promises';
import { UrlSafetyDefaults } from './common/constants';
import { UrlSafetyErrors } from './common/errors';
import type { IUrlSafetyPolicy } from './common/types';
import { UrlPolicy } from './policy';

/** Fetching an untrusted url without letting it reach inside the network. */
export class UrlIngest {
  /**
   * Rejects when ANY resolved address is non-public. Checking only the first walks straight into a
   * host that publishes one public A record beside an internal one.
   *
   * A rebinding window remains: the address can change between this check and the connect. Closing
   * it means connecting to the resolved address and setting `Host` by hand, which no fetch API
   * exposes.
   */
  static async assertPublicHost(opts: {
    hostname: string;
    policy?: IUrlSafetyPolicy;
  }): Promise<void> {
    const { hostname, policy } = opts;

    if (policy?.allowPrivateAddress ?? UrlSafetyDefaults.ALLOW_PRIVATE_ADDRESS) {
      return;
    }

    // `URL.hostname` keeps the brackets on an IPv6 literal; `lookup` does not accept them, and the
    // ENOTFOUND that follows reads as a transient DNS failure rather than the refusal it should be.
    const address = UrlPolicy.readHostAddress({ hostname });
    const addresses = await lookup(address, { all: true });

    if (!addresses.length) {
      throw getError({
        error: UrlSafetyErrors.URL_REFUSED,
        message: `[assertPublicHost] Host resolves to nothing | host: ${hostname}`,
      });
    }

    const offender = addresses.find(entry =>
      UrlPolicy.isNonPublicAddress({ address: entry.address }),
    );

    if (offender) {
      throw getError({
        error: UrlSafetyErrors.URL_REFUSED,
        message: `[assertPublicHost] Host resolves to a non-public address | host: ${hostname} | address: ${offender.address}`,
      });
    }
  }

  /** Both halves, in the order they must run: shape first, then the network. */
  static async assertReachableUrl(opts: { url: string; policy?: IUrlSafetyPolicy }): Promise<URL> {
    const parsed = UrlPolicy.assertSafeUrl(opts);
    await UrlIngest.assertPublicHost({ hostname: parsed.hostname, policy: opts.policy });
    return parsed;
  }

  private static readTimeoutMilliseconds(opts: { policy?: IUrlSafetyPolicy }): number {
    const { timeout } = opts.policy ?? {};
    const milliseconds = timeout ? DurationMultipliers.toMilliseconds(timeout) : null;
    return milliseconds ?? UrlSafetyDefaults.TIMEOUT_MILLISECONDS;
  }

  /**
   * A GET that an untrusted url cannot steer inside the network. Redirects are followed by hand so
   * every hop is re-checked - `redirect: 'follow'` would land on an internal host with no second
   * look.
   *
   * The body is returned unread: the caller decides whether to stream it onward or cap it with
   * {@link UrlIngest.readCappedBody}. Nothing is buffered here.
   */
  static async fetchGuarded(opts: {
    url: string;
    policy?: IUrlSafetyPolicy;
    headers?: Record<string, string>;
  }): Promise<Response> {
    const { url, policy, headers } = opts;
    const maxRedirects = policy?.maxRedirects ?? UrlSafetyDefaults.MAX_REDIRECTS;
    const timeoutMilliseconds = UrlIngest.readTimeoutMilliseconds({ policy });

    let target = await UrlIngest.assertReachableUrl({ url, policy });

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const response = await fetch(target, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMilliseconds),
        ...(headers ? { headers } : {}),
      });

      if (response.status < 300 || response.status > 399) {
        if (!response.ok) {
          // Cancelled, or the socket stays open on every 4xx and 5xx.
          await response.body?.cancel();
          throw getError({
            message: `[fetchGuarded] Request failed | status: ${response.status} | url: ${url}`,
          });
        }

        return response;
      }

      const location = response.headers.get('location');
      await response.body?.cancel();

      if (!location) {
        throw getError({
          error: UrlSafetyErrors.URL_REFUSED,
          message: `[fetchGuarded] Redirect carried no location | url: ${url}`,
        });
      }

      target = await UrlIngest.assertReachableUrl({
        url: new URL(location, target).toString(),
        policy,
      });
    }

    throw getError({
      error: UrlSafetyErrors.URL_REFUSED,
      message: `[fetchGuarded] Too many redirects | max: ${maxRedirects} | url: ${url}`,
    });
  }

  /**
   * Enforces `maxBytes` on a stream nothing reads into this process - the shape a caller wants when
   * the body is piped onward rather than held. Without it a `maxBytes` policy is inert on that path.
   */
  static capStream(opts: {
    source: ReadableStream<Uint8Array>;
    policy?: IUrlSafetyPolicy;
  }): ReadableStream<Uint8Array> {
    const { source } = opts;
    const maxBytes = opts.policy?.maxBytes ?? UrlSafetyDefaults.MAX_BYTES;
    let received = 0;

    return source.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          received += chunk.byteLength;

          if (received > maxBytes) {
            controller.error(
              getError({
                error: UrlSafetyErrors.URL_REFUSED,
                message: `[capStream] Body exceeds the cap | received: ${received} | max: ${maxBytes}`,
              }),
            );
            return;
          }

          controller.enqueue(chunk);
        },
      }),
    );
  }

  /**
   * Reads a body that must not exceed `maxBytes`, cancelling the moment it does. `content-length` is
   * checked first because it is free, and counted anyway because it may be absent or lie.
   */
  static async readCappedBody(opts: {
    response: Response;
    policy?: IUrlSafetyPolicy;
  }): Promise<Buffer> {
    const { response, policy } = opts;
    const maxBytes = policy?.maxBytes ?? UrlSafetyDefaults.MAX_BYTES;

    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > maxBytes) {
      await response.body?.cancel();
      // The same fact as the streaming branch below, so the same verdict: a caller must not retry an
      // oversized body when the server sends `content-length` and drop it when the server omits one.
      throw getError({
        error: UrlSafetyErrors.URL_REFUSED,
        message: `[readCappedBody] Body exceeds the cap | declared: ${declaredLength} | max: ${maxBytes}`,
      });
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw getError({ message: '[readCappedBody] Response carried no body' });
    }

    const chunks: Uint8Array[] = [];
    let received = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      received += value.length;
      if (received > maxBytes) {
        await reader.cancel();
        throw getError({
          error: UrlSafetyErrors.URL_REFUSED,
          message: `[readCappedBody] Body exceeds the cap | received: ${received} | max: ${maxBytes}`,
        });
      }

      chunks.push(value);
    }

    return Buffer.concat(chunks);
  }
}
