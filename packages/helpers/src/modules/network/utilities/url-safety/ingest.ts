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
   * Resolves `hostname` once and returns every address it answered, refusing the host when ANY of them is non-public.
   * Checking only the first walks straight into a host that publishes one public A record beside an internal one.
   * An IP literal answers itself. `allowPrivateAddress` skips the check and returns an empty list: nothing to pin to.
   */
  static async resolvePublicAddresses(opts: {
    hostname: string;
    policy?: IUrlSafetyPolicy;
    signal?: AbortSignal;
  }): Promise<string[]> {
    const { hostname, policy, signal } = opts;

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

    const offender = addresses.find((entry) =>
      UrlPolicy.isNonPublicAddress({ address: entry.address }),
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
    policy?: IUrlSafetyPolicy;
  }): Promise<void> {
    await UrlIngest.resolvePublicAddresses(opts);
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
      return await Promise.race([work, aborted]);
    } finally {
      signal.removeEventListener('abort', onAbort as () => void);
      // The lookup that lost keeps running; its late answer or error must not surface as an unhandled rejection.
      work.catch(() => undefined);
    }
  }

  /** Request headers that name the body; they go when a redirect turns the request into a GET. */
  private static readonly BODY_HEADERS = ['content-type', 'content-length', 'content-encoding'];

  /**
   * The only caller headers a cross-origin redirect keeps. Every other one is dropped: a tenant's webhook secret
   * (`x-api-key`, a signature) must not follow a redirect to a host that tenant did not name.
   */
  private static readonly CROSS_ORIGIN_HEADERS = ['accept', 'accept-language', 'user-agent'];

  /** The statuses that name a new location; a 304 or a 300 is an answer, not a redirect. */
  private static readonly REDIRECT_STATUSES = [301, 302, 303, 307, 308];

  /** Connect-phase errors: nothing was sent, so trying the next vetted address cannot deliver a request twice. */
  private static readonly CONNECT_ERROR_CODES = [
    'ECONNREFUSED',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'EADDRNOTAVAIL',
  ];

  private static onlyHeaders(opts: {
    headers: Record<string, string>;
    names: string[];
  }): Record<string, string> {
    const { headers, names } = opts;

    return Object.fromEntries(
      Object.entries(headers).filter(([name]) => names.includes(name.toLowerCase())),
    );
  }

  private static withoutHeaders(opts: {
    headers: Record<string, string>;
    names: string[];
  }): Record<string, string> {
    const { headers, names } = opts;

    return Object.fromEntries(
      Object.entries(headers).filter(([name]) => !names.includes(name.toLowerCase())),
    );
  }

  /**
   * One request to `target`. With `addresses` it connects to those vetted addresses and nowhere else, in order, and
   * moves to the next one only when the connection itself fails: the url's host is set as the `Host` header, and for
   * https as the TLS server name, so the certificate is still checked against the name the caller asked for.
   */
  private static async send(opts: {
    target: URL;
    addresses: string[];
    init: RequestInit;
  }): Promise<Response> {
    const { target, addresses, init } = opts;

    if (!addresses.length) {
      return fetch(target, init);
    }

    // `proxy: false` is Bun's way to ignore HTTP_PROXY / HTTPS_PROXY for this call (an empty string or undefined keeps
    // the environment's proxy, which would resolve the name itself and undo the pin). A test pins it.
    const noProxy = { proxy: false } as unknown as RequestInit;
    const isHttps = target.protocol === 'https:';
    const hasNameToVerify =
      isHttps &&
      !UrlPolicy.readHostAddress({ hostname: target.hostname }).includes(':') &&
      !/^[\d.]+$/.test(target.hostname);
    const headers = {
      ...UrlIngest.withoutHeaders({
        headers: (init.headers as Record<string, string> | undefined) ?? {},
        names: ['host'],
      }),
      Host: target.host,
    };
    let lastError: unknown;

    for (const address of addresses) {
      const pinned = new URL(target);
      pinned.hostname = address.includes(':') ? `[${address}]` : address;

      try {
        const result = await fetch(pinned, {
          ...init,
          ...noProxy,
          headers,
          ...(hasNameToVerify ? { tls: { serverName: target.hostname } } : {}),
        });

        return result;
      } catch (error) {
        const name = (error as Error | undefined)?.name;

        // The deadline is not a reason to try another address: it is spent.
        if (name === 'AbortError' || name === 'TimeoutError') {
          throw error;
        }

        // A request that may have reached the server (a reset after the body went out) is not repeated on another
        // address unless it is safe to repeat: a webhook must not be delivered twice.
        const code = (error as { code?: string } | undefined)?.code ?? '';
        const method = (init.method ?? 'GET').toUpperCase();

        if (
          method !== 'GET' &&
          method !== 'HEAD' &&
          !UrlIngest.CONNECT_ERROR_CODES.includes(code)
        ) {
          throw error;
        }

        lastError = error;
      }
    }

    throw lastError;
  }

  /**
   * A request that an untrusted url cannot steer inside the network. GET by default; `method`, `headers` and `body`
   * (text or bytes, so a redirect can replay it) make it a signed webhook dispatch.
   *
   * The host is resolved ONCE per hop, every answer is checked, and the request connects to those addresses and to no
   * other, so a DNS answer that changes after the check (DNS rebinding) is never looked up again. The `Host` header and,
   * for https, the TLS server name stay the url's own, so the certificate is verified for that name. A `Host` in
   * `headers` is ignored. The environment's `HTTP_PROXY` / `HTTPS_PROXY` is ignored on a pinned
   * connection, because a proxy would resolve the name itself and undo the pin. `policy.proxy` sends the request through a
   * proxy on purpose; that connection is not pinned (see `IUrlSafetyPolicy.proxy`). `allowPrivateAddress` turns the guard,
   * and so the pin, off.
   *
   * Redirects are followed by hand so every hop is re-checked and re-pinned - `redirect: 'follow'` would land on an
   * internal host with no second look. 301, 302 (for a POST) and 303 turn the request into a GET without a body. A 307 or
   * 308 repeats the request; with a body it is refused when it leaves the origin, so a signed payload is never replayed to
   * a host a redirect chose. When a hop changes origin every caller header is dropped except `accept`, `accept-language` and `user-agent`.
   *
   * The body is returned unread: the caller decides whether to stream it onward or cap it with
   * {@link UrlIngest.readCappedBody}. Nothing is buffered here.
   */
  static async fetchGuarded(opts: {
    url: string;
    policy?: IUrlSafetyPolicy;
    method?: string;
    headers?: Record<string, string>;
    body?: string | Uint8Array;
  }): Promise<Response> {
    const { url, policy } = opts;
    const maxRedirects = policy?.maxRedirects ?? UrlSafetyDefaults.MAX_REDIRECTS;
    const timeoutMilliseconds = UrlIngest.readTimeoutMilliseconds({ policy });

    let method = (opts.method ?? 'GET').toUpperCase();
    let headers = opts.headers ?? {};
    let body = opts.body;

    if (body !== undefined && (method === 'GET' || method === 'HEAD')) {
      throw getError({
        message: `[fetchGuarded] A ${method} request cannot carry a body | url: ${url}`,
      });
    }

    let target = UrlPolicy.assertSafeUrl({ url, policy });
    // ONE deadline for the whole call, every lookup and every hop included, not one per hop.
    const signal = AbortSignal.timeout(timeoutMilliseconds);

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const addresses = await UrlIngest.resolvePublicAddresses({
        hostname: target.hostname,
        policy,
        signal,
      });

      const response = await UrlIngest.send({
        target,
        // A proxy resolves the name itself, so there is nothing to pin: the caller chose it (`policy.proxy`).
        addresses: policy?.proxy ? [] : addresses,
        init: {
          method,
          ...(policy?.proxy ? ({ proxy: policy.proxy } as unknown as RequestInit) : {}),
          redirect: 'manual',
          signal,
          ...(Object.keys(headers).length ? { headers } : {}),
          ...(body === undefined ? {} : { body }),
        },
      });

      if (!UrlIngest.REDIRECT_STATUSES.includes(response.status)) {
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

      const next = UrlPolicy.assertSafeUrl({ url: new URL(location, target).toString(), policy });
      const isSameOrigin = next.origin === target.origin;
      const becomesGet =
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) && method === 'POST');

      if (becomesGet) {
        method = 'GET';
        body = undefined;
        headers = UrlIngest.withoutHeaders({ headers, names: UrlIngest.BODY_HEADERS });
      } else if (body !== undefined && !isSameOrigin) {
        throw getError({
          error: UrlSafetyErrors.URL_REFUSED,
          message: `[fetchGuarded] Redirect would replay the request body to another origin | from: ${target.origin} | to: ${next.origin}`,
        });
      }

      if (!isSameOrigin) {
        headers = UrlIngest.onlyHeaders({ headers, names: UrlIngest.CROSS_ORIGIN_HEADERS });
      }

      target = next;
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
