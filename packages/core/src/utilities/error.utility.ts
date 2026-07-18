import { CoreErrorCodes } from '@/common';
import type { ILogger } from '@venizia/ignis-helpers';
import { getError, HTTP } from '@venizia/ignis-helpers';

/**
 * Standardized NotSupported error (HTTP 501) for a capability an implementation deliberately does
 * not provide. Logs a warning before throwing so the gap shows in operational logs, not just to the caller.
 */
export const throwNotSupported = (opts: {
  scope: string;
  feature: string;
  logger: ILogger;
}): never => {
  const { scope, feature, logger } = opts;

  logger.for(throwNotSupported.name).warn('%s is not supported | Scope: %s', feature, scope);

  throw getError({
    statusCode: HTTP.ResultCodes.RS_5.NotImplemented,
    messageCode: CoreErrorCodes.NOT_SUPPORTED,
    message: `[${scope}] ${feature} is not supported.`,
  });
};
