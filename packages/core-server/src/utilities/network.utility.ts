import { ApplicationLogger, ErrorPrettier } from '@venizia/ignis-helpers';
import type { Context } from 'hono';

export class NetworkUtility {
  private static readonly logger = ApplicationLogger.get('getIncomingIp');
  /** Latches the warning: an absent conninfo peer fails identically for every later request. */
  private static hasReportedUnavailable = false;

  /**
   * Resolved once, on first use - not per request.
   *
   * `require()` re-walks module resolution on every call: measured at 1.35 us per request against
   * 0.014 us once memoised, and `RequestSpyMiddleware` puts this on the DEFAULT request path. Still
   * LAZY, though - `hono/bun` resolves only under Bun, so loading it at module load would make this
   * module unimportable anywhere else (a bundler, a type check) instead of a per-request fallback.
   */
  private static connInfoReader?: (context: Context) => { remote?: { address?: string } };

  /** Reads the incoming IP from Bun's connection info (`hono/bun`). */
  static getIncomingIp(context: Context): string | null {
    try {
      NetworkUtility.connInfoReader ??= require('hono/bun').getConnInfo;

      return NetworkUtility.connInfoReader?.(context)?.remote?.address ?? null;
    } catch (error) {
      if (NetworkUtility.hasReportedUnavailable) {
        return null;
      }

      NetworkUtility.hasReportedUnavailable = true;
      NetworkUtility.logger.warn(
        '[getIncomingIp] Connection info unavailable - reporting null for every request | %s',
        ErrorPrettier.format({ error }),
      );

      return null;
    }
  }
}
