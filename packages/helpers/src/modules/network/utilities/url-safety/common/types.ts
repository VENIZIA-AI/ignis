import type { IDuration } from '@/common/constants/duration';

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

  /** When set, nothing outside the list passes, whatever it resolves to. */
  allowedHosts?: string[];

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
   * A proxy for `UrlIngest.fetchGuarded` to send the request through, as `http://host:port`. Off by default, and the
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
