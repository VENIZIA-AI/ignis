import type { IDuration } from '@/common/constants/duration';

/** An origin written the way `new URL(origin).origin` writes it: scheme, host and a non-default port, nothing else. */
export type TTrustedOrigin = `${'http' | 'https'}://${string}`;

/** The origins a caller trusts, and whether it trusts nothing else. */
export interface IUrlTrustedHosts {
  /**
   * Exact origins that pass whatever they resolve to: `https://cdn.example.com`, `http://vault.corp.local:8200`,
   * `http://10.0.0.5:8080`, `http://[fd00::1]`. An entry is valid only when `new URL(entry).origin === entry`, so a path,
   * a query, credentials, upper case, a trailing slash, a default port (`:443`) or an odd IP spelling
   * (`http://2130706433`) is refused with a configuration error.
   */
  trusted: TTrustedOrigin[];

  /**
   * Only the trusted origins pass; every other origin is refused, a public one included. Needs at least one trusted origin.
   * @default false
   */
  strict?: boolean;
}

/**
 * What a caller will accept from an untrusted url. Every field is per call: an app that must reach
 * plain `http` says so at the call site rather than weakening a build-time constant for everyone.
 */
export interface IUrlSafetyPolicy {
  /**
   * The schemes a url may use.
   * @default ['https:']
   */
  allowedSchemes?: string[];

  /**
   * Whether a url may resolve to a private address. Turning it on in a path that takes urls from user input re-opens the
   * server-side request forgery this guard exists to close - a request can then be steered at
   * `169.254.169.254` and the cloud credentials behind it.
   * @default false
   */
  allowPrivateAddress?: boolean;

  /**
   * Origins the caller trusts. An origin in `trusted` passes the guard even when it resolves to a private address, so a
   * service on the internal network can be reached on purpose while every other url keeps the full guard. The request
   * still connects to the addresses that were checked, and every redirect hop is judged again. With `strict` nothing
   * outside the list passes. The cloud metadata addresses open only when the trusted origin's host IS that literal
   * address, never because a trusted host name resolves to one.
   */
  hosts?: IUrlTrustedHosts;

  /**
   * Redirects followed. Each hop is re-checked, so a public host cannot bounce into a private one.
   * @default 3
   */
  maxRedirects?: number;

  /**
   * How long a request may take. A slow host holds a worker slot for exactly this long.
   * @default UrlSafetyDefaults.TIMEOUT_MILLISECONDS
   */
  timeout?: IDuration;

  /**
   * A proxy for a guarded fetcher call (`NativeFetcher` only) to send the request through, as `http://host:port`. Off by default, and the
   * environment's `HTTP_PROXY` / `HTTPS_PROXY` is ignored: a proxy resolves the host name itself, so the vetted address
   * the guard pins to would never be used. With this set the address check still runs, but the connection is NOT pinned:
   * the proxy decides where the request goes, so only point it at a proxy you trust to refuse internal addresses.
   */
  proxy?: string;

  /**
   * Largest body, in bytes. The read stops and cancels the moment the body crosses it.
   * @default UrlSafetyDefaults.MAX_BYTES
   */
  maxBytes?: number;
}
