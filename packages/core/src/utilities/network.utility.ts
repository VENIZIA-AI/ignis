import { RuntimeModules } from '@venizia/ignis-helpers';
import { Context } from 'hono';

/**
 * Attempts to get the incoming IP address from the connection info.
 * Works across different runtimes (Bun, Node.js, etc.) by using runtime-specific methods.
 */
export const getIncomingIp = (context: Context): string | null => {
  try {
    if (RuntimeModules.isBun()) {
      const { getConnInfo } = require('hono/bun');
      const connInfo = getConnInfo(context);
      return connInfo?.remote?.address ?? null;
    } else {
      const { getConnInfo } = require('@hono/node-server/conninfo');
      const connInfo = getConnInfo(context);
      return connInfo?.remote?.address ?? null;
    }
  } catch {
    // getConnInfo not available or failed
    return null;
  }
};
