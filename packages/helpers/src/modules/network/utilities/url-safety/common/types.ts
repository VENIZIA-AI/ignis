import type { IDuration } from '@/common/constants/duration';

/**
 * What a caller will accept from an untrusted url. Every field is per call: an app that must reach
 * plain `http` says so at the call site rather than weakening a build-time constant for everyone.
 */
export interface IUrlSafetyPolicy {
  /** Defaults to `['https:']`. */
  allowedSchemes?: string[];

  /**
   * Defaults to `false`. Turning it on in a path that takes urls from user input re-opens the
   * server-side request forgery this guard exists to close - a request can then be steered at
   * `169.254.169.254` and the cloud credentials behind it.
   */
  allowPrivateAddress?: boolean;

  /** When set, nothing outside the list passes, whatever it resolves to. */
  allowedHosts?: string[];

  /** Defaults to 3. Each hop is re-checked, so a public host cannot bounce into a private one. */
  maxRedirects?: number;

  /** Defaults to 10 seconds. A slow host holds a worker slot for exactly this long. */
  timeout?: IDuration;

  /** Defaults to 10 MB. The read stops and cancels the moment the body crosses it. */
  maxBytes?: number;
}
