import { Defaults } from '@/common/constants';
import { AnyType } from '@/common/types';
import pino from 'pino';
import { resolveLoggerLevel } from '../common';

import { PINO_CUSTOM_LEVELS, TPinoInstance } from './common';
import { PinoDestination } from './destination';

/** Owns the single pino instance every scope writes through, and the transport thread behind it. */
export class PinoBackingLogger {
  private static instance: TPinoInstance | undefined;
  /** The `ThreadStream` behind `instance`, held ONLY when built via a transport (pretty/roll) and `undefined` for `stdout` or an injected instance - tracked so a replacement can close the worker instead of orphaning it. */
  private static transport: pino.DestinationStream | undefined;

  /** Pure: pino constructor options derived from env at CALL time. Public so tests can build a REAL instance against an in-memory destination, without the impure singleton. */
  static buildOptions() {
    return {
      name: Defaults.APPLICATION_NAME,
      level: resolveLoggerLevel({ configured: process.env.APP_ENV_LOGGER_LEVEL }),
      customLevels: PINO_CUSTOM_LEVELS,
    };
  }

  /** Lazy, env-driven singleton, built once and reused by every scope entirely synchronously - the very first log line already targets the real env-configured destination, no stdout bootstrap. `set()` is the only way to replace it; this getter never resets it. */
  static get(): TPinoInstance {
    if (!PinoBackingLogger.instance) {
      const destination = PinoDestination.build(PinoDestination.resolvePlan());
      PinoBackingLogger.instance = pino(
        PinoBackingLogger.buildOptions(),
        destination,
      ) as TPinoInstance;
      PinoBackingLogger.transport = destination;
    }
    return PinoBackingLogger.instance;
  }

  /** Replaces the singleton outright: an outgoing transport-backed instance (pretty/roll) is a `ThreadStream` on a live worker thread, so this flushes then `.end()`s it first rather than orphaning the worker; failures are logged via `console.error`, never swallowed. */
  static set(opts: { instance: TPinoInstance }): void {
    if (PinoBackingLogger.instance) {
      PinoBackingLogger.instance.flush();
      PinoBackingLogger.closeTransport();
    }

    PinoBackingLogger.instance = opts.instance;
    PinoBackingLogger.transport = undefined;
  }

  private static closeTransport(): void {
    if (!PinoBackingLogger.transport) {
      return;
    }

    try {
      (PinoBackingLogger.transport as AnyType).end();
    } catch (error) {
      console.error('[setPinoBackingLogger] Failed to close previous transport stream', error);
    }
  }
}

// Published names, kept so `@venizia/ignis-helpers/pino` consumers do not have to move; the class
// above is the implementation and the entry point for new code.
export const buildPinoOptions = () => PinoBackingLogger.buildOptions();

export const getPinoBackingLogger = (): TPinoInstance => PinoBackingLogger.get();

export const setPinoBackingLogger = (opts: { instance: TPinoInstance }): void =>
  PinoBackingLogger.set(opts);
