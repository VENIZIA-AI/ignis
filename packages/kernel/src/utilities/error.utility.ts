import { CoreErrorCodes } from '@/common/error-codes';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { ILogger } from '@venizia/ignis-helpers/core';
import { getError } from '@venizia/ignis-helpers/core';

/** Errors an implementation raises on purpose. */
export class ErrorUtility {
  /** Standardized NotSupported error (HTTP 501) for a capability an implementation deliberately does not provide - logs a warning before throwing so the gap shows in operational logs, not just to the caller. */
  static throwNotSupported(opts: { scope: string; feature: string; logger: ILogger }): never {
    const { scope, feature, logger } = opts;

    logger
      .for(ErrorUtility.throwNotSupported.name)
      .warn('%s is not supported | Scope: %s', feature, scope);

    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.NotImplemented,
      messageCode: CoreErrorCodes.NOT_SUPPORTED,
      message: `[${scope}] ${feature} is not supported.`,
    });
  }
}

/** @deprecated Use ErrorUtility.throwNotSupported({ scope, feature, logger }). Removed in 0.5. */
export const throwNotSupported = (opts: {
  scope: string;
  feature: string;
  logger: ILogger;
}): never => {
  return ErrorUtility.throwNotSupported(opts);
};
