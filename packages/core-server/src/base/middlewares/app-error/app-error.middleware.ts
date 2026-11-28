import { Environment, ErrorPrettier } from '@venizia/ignis-helpers';
import { BaseAppErrorMiddleware } from '@venizia/ignis-kernel';
import type { ILogger } from '@venizia/ignis-helpers/core';
import type { TErrorLogFormatter } from '@venizia/ignis-kernel';
import type { Context } from 'hono';
import { GrpcNativeCallStore } from '@/base/controllers/grpc/native/call.store';

/** The longest host name DNS carries, and a port. */
const MAX_LOGGED_HOST = 261;
/** What no host and port is written with: names, IPv4 and IPv6 addresses need nothing else. */
const NOT_IN_A_HOST = /[^A-Za-z0-9._:[\]-]/g;

/**
 * The server-side error handler: it does what {@link BaseAppErrorMiddleware} does, which is browser-pure, and
 * supplies the two host reads as OPTIONS - the ambient `NODE_ENV` through `Environment.ambient` (a read `bun build`
 * cannot fold into a literal), and `ErrorPrettier`, which reaches `node:util` and so cannot sit in the kernel.
 *
 * For a call of the native gRPC port its log names the host the caller asked for, not the internal origin of the request.
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
      formatError: opts?.formatError ?? ((formatOpts) => ErrorPrettier.format(formatOpts)),
    });
  }

  /** The host is whatever the caller sent: it is bounded, cleaned, and used in the log line only. */
  protected override readLogUrl(opts: { context: Context }): string {
    const { context } = opts;

    if (!GrpcNativeCallStore.read({ env: context.env })) {
      return super.readLogUrl(opts);
    }

    const host = (context.req.header('host') ?? '')
      .slice(0, MAX_LOGGED_HOST)
      .replace(NOT_IN_A_HOST, '?');

    return `grpc://${host}${context.req.path}`;
  }
}
