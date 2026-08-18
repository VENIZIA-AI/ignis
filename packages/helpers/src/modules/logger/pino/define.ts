import { Defaults } from '@/common/constants';
import { AnyType } from '@/common/types';
import { ModuleUtility } from '@/utilities/module.utility';
import path from 'node:path';
import pino from 'pino';
import { LoggerFormats, resolveLoggerLevel } from '../common';

import { TPinoCustomLevelName, TPinoInstance } from './common';

/** pino levels are ASCENDING severity (error 50 > warn 40 > info 30 > debug 20); `emerg`(70) extends above error. NORMATIVE - do not renumber without updating the spec. */
export const PINO_CUSTOM_LEVELS: Record<TPinoCustomLevelName, number> = {
  emerg: 70,
};

export type TFrequency = 'hourly' | 'daily';

/** Pure description of where pino should write, derived from env; `PinoDestination.build()` is the impure half that acts on it. */
export type TDestinationPlan =
  | { kind: 'stdout' }
  | { kind: 'pretty' }
  | {
      kind: 'roll';
      options: {
        file: string;
        frequency: TFrequency;
        size: string;
        limit: { count: number };
        mkdir: true;
      };
    };

/** Reads `APP_ENV_LOGGER_*` and turns it into a destination. Warning prefixes name the operation, not the class - the tests and the published API still call these `mapFrequency`/`mapMaxFilesToCount`. */
export class PinoDestination {
  private static readonly DEFAULT_FREQUENCY: TFrequency = 'hourly';
  private static readonly DEFAULT_MAX_FILES = '5d';

  /** `APP_ENV_LOGGER_FILE_FREQUENCY` -> pino-roll's `frequency`; an unrecognized value warns and falls back rather than throwing, so the app still boots. */
  static mapFrequency(value?: string): TFrequency {
    const normalized = (value ?? '1h').trim().toLowerCase();

    switch (normalized) {
      case '1h': {
        return 'hourly';
      }
      case '1d':
      case '24h': {
        return 'daily';
      }
      default: {
        console.warn(
          '[mapFrequency] Invalid logger file frequency | value: %s | fallback: %s',
          value,
          PinoDestination.DEFAULT_FREQUENCY,
        );
        return PinoDestination.DEFAULT_FREQUENCY;
      }
    }
  }

  /** `null` means "not a recognized shape" - the caller decides what default to fall back to. */
  private static parseMaxFilesValue(value: string, frequency: TFrequency): number | null {
    const dayMatch = /^(\d+)d$/i.exec(value);
    if (dayMatch) {
      const days = Number.parseInt(dayMatch[1], 10);
      return frequency === 'hourly' ? days * 24 : days;
    }

    const bareMatch = /^\d+$/.exec(value);
    if (bareMatch) {
      return Number.parseInt(value, 10);
    }

    return null;
  }

  /** `APP_ENV_LOGGER_FILE_MAX_FILES` -> pino-roll's `limit.count`: `'<n>d'` scales by frequency (hourly: days*24), a bare integer is a literal count, unrecognized falls back to `'5d'`. */
  static mapMaxFilesToCount(opts: { value?: string; frequency: TFrequency }): number {
    const { value, frequency } = opts;
    const normalized = value?.trim();

    if (normalized) {
      const parsed = PinoDestination.parseMaxFilesValue(normalized, frequency);
      if (parsed !== null) {
        return parsed;
      }
    }

    // Unset is a normal configuration (mirror the sibling defaults) - only a PROVIDED value that failed to parse deserves a warning.
    if (normalized && normalized !== PinoDestination.DEFAULT_MAX_FILES) {
      console.warn(
        '[mapMaxFilesToCount] Invalid logger file max files value | value: %s | fallback: %s',
        value,
        PinoDestination.DEFAULT_MAX_FILES,
      );
    }

    return PinoDestination.parseMaxFilesValue(
      PinoDestination.DEFAULT_MAX_FILES,
      frequency,
    ) as number;
  }

  /** Pure: which destination pino should write to, derived from `APP_ENV_LOGGER_*` at CALL time. `DATE_PATTERN` is deliberately not read - pino-roll has no equivalent. */
  static resolvePlan(): TDestinationPlan {
    const folderPath = process.env.APP_ENV_LOGGER_FOLDER_PATH;

    if (folderPath && folderPath.trim() !== '') {
      const frequency = PinoDestination.mapFrequency(process.env.APP_ENV_LOGGER_FILE_FREQUENCY);
      const count = PinoDestination.mapMaxFilesToCount({
        value: process.env.APP_ENV_LOGGER_FILE_MAX_FILES,
        frequency,
      });

      return {
        kind: 'roll',
        options: {
          file: path.join(folderPath, Defaults.APPLICATION_NAME),
          frequency,
          size: process.env.APP_ENV_LOGGER_FILE_MAX_SIZE ?? '100m',
          limit: { count },
          mkdir: true,
        },
      };
    }

    // UNSET means NDJSON to stdout, the locked default for this provider; only an EXPLICIT `text` opts into pino-pretty, and falling back to TEXT here (winston's default) would make the documented minimal install (pino only, no pino-pretty) crash on its first log line.
    if (process.env.APP_ENV_LOGGER_FORMAT === LoggerFormats.TEXT) {
      return { kind: 'pretty' };
    }

    return { kind: 'stdout' };
  }

  /** `pino.transport()` is SYNCHRONOUS - it returns a `ThreadStream` that BUFFERS writes until its worker thread loads, so no async gating is needed; `ModuleUtility.assertInstalled` runs first so a missing optional peer fails loudly here, not as an opaque worker-thread crash. */
  static build(plan: TDestinationPlan): pino.DestinationStream | undefined {
    switch (plan.kind) {
      case 'stdout': {
        return undefined;
      }
      case 'pretty': {
        ModuleUtility.assertInstalled({ scope: 'PinoLogger', modules: ['pino-pretty'] });
        return pino.transport({ target: 'pino-pretty' });
      }
      case 'roll': {
        ModuleUtility.assertInstalled({ scope: 'PinoLogger', modules: ['pino-roll'] });
        return pino.transport({ target: 'pino-roll', options: plan.options });
      }
      default: {
        return undefined;
      }
    }
  }
}

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

// Published names, kept so `@venizia/ignis-helpers/pino` consumers do not have to move; the classes
// above are the implementation and the entry point for new code.
export const mapFrequency = (value?: string): TFrequency => PinoDestination.mapFrequency(value);

export const mapMaxFilesToCount = (opts: { value?: string; frequency: TFrequency }): number =>
  PinoDestination.mapMaxFilesToCount(opts);

export const resolveDestinationPlan = (): TDestinationPlan => PinoDestination.resolvePlan();

export const buildDestination = (plan: TDestinationPlan): pino.DestinationStream | undefined =>
  PinoDestination.build(plan);

export const buildPinoOptions = () => PinoBackingLogger.buildOptions();

export const getPinoBackingLogger = (): TPinoInstance => PinoBackingLogger.get();

export const setPinoBackingLogger = (opts: { instance: TPinoInstance }): void =>
  PinoBackingLogger.set(opts);
