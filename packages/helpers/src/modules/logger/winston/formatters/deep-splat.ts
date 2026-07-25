import winston from 'winston';
import { AnyType } from '@/common/types';
import { formatLogMessage } from '../../formatting';

/** Winston stashes the extra arguments of `logger.error(msg, ...args)` under this well-known key. */
const SPLAT = Symbol.for('splat');

/** Drop-in replacement for `winston.format.splat()` that formats through {@link formatLogMessage}; every transport reads `info.message`, so widening it here widens console, file and dgram at once. */
export const deepSplat = winston.format(info => {
  const args = (info as AnyType)[SPLAT] as Array<unknown> | undefined;

  if (!args?.length || typeof info.message !== 'string') {
    return info;
  }

  info.message = formatLogMessage({ message: info.message, args });
  return info;
});
