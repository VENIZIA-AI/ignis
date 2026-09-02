import { Environment, ErrorPrettier } from '@venizia/ignis-helpers';
import { BaseAppErrorMiddleware } from '@venizia/ignis-kernel';
import type { ILogger } from '@venizia/ignis-helpers/core';
import type { TErrorLogFormatter } from '@venizia/ignis-kernel';

/**
 * The server-side error handler: everything it does lives on {@link BaseAppErrorMiddleware}, which
 * is browser-pure. This supplies the two host reads as OPTIONS - the ambient `NODE_ENV` through
 * `Environment.ambient` (a read `bun build` cannot fold into a literal), and `ErrorPrettier`, which
 * reaches `node:util` and so cannot sit in the kernel.
 *
 * A class only so the name `AppErrorMiddleware` keeps resolving for existing consumers; it overrides
 * nothing. New code can pass the same two options to `BaseAppErrorMiddleware` directly.
 */
export class AppErrorMiddleware extends BaseAppErrorMiddleware {
  constructor(opts?: {
    logger?: ILogger;
    rootKey?: string;
    intentionalStackFrames?: number;
    unexpectedStackFrames?: number;
    environment?: () => string | undefined;
    formatError?: TErrorLogFormatter;
  }) {
    super({
      ...opts,
      // Present, so an unresolved name here is a real misconfiguration and keeps its error line - a
      // node host always HAS an ambient environment, even when it is not set.
      environment: opts?.environment ?? (() => Environment.ambient),
      formatError: opts?.formatError ?? (formatOpts => ErrorPrettier.format(formatOpts)),
    });
  }
}
