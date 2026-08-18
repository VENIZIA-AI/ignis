import { RuntimeModules } from '@venizia/ignis-helpers/common';
import { ApplicationLogger, ErrorPrettier } from '@venizia/ignis-helpers';
import type { Context } from 'hono';

export class NetworkUtility {
  private static readonly logger = ApplicationLogger.get('getIncomingIp');
  /** Latches the warning: an absent conninfo peer fails identically for every later request. */
  private static hasReportedUnavailable = false;

  /** Reads the incoming IP from connection info across runtimes (Bun, Node.js) via runtime-specific methods. */
  static getIncomingIp(context: Context): string | null {
    try {
      const { getConnInfo } = RuntimeModules.isBun()
        ? require('hono/bun')
        : require('@hono/node-server/conninfo');

      return getConnInfo(context)?.remote?.address ?? null;
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
