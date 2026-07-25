import { ApplicationLogger, ErrorPrettier, RuntimeModules } from '@venizia/ignis-helpers';
import type { Context } from 'hono';

const logger = ApplicationLogger.get('getIncomingIp');

/** Latches the warning: an absent conninfo peer fails identically for every later request. */
let hasReportedUnavailable = false;

/** Reads the incoming IP from connection info across runtimes (Bun, Node.js) via runtime-specific methods. */
export const getIncomingIp = (context: Context): string | null => {
  try {
    const { getConnInfo } = RuntimeModules.isBun()
      ? require('hono/bun')
      : require('@hono/node-server/conninfo');

    return getConnInfo(context)?.remote?.address ?? null;
  } catch (error) {
    if (hasReportedUnavailable) {
      return null;
    }

    hasReportedUnavailable = true;
    logger.warn(
      '[getIncomingIp] Connection info unavailable - reporting null for every request | %s',
      ErrorPrettier.format({ error }),
    );

    return null;
  }
};
