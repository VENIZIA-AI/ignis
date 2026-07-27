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

/** Pure description of where pino should write, derived from env; `buildDestination()` is the impure half that acts on it. */
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

const DEFAULT_FREQUENCY: TFrequency = 'hourly';
const DEFAULT_MAX_FILES = '5d';

/** `APP_ENV_LOGGER_FILE_FREQUENCY` -> pino-roll's `frequency`; an unrecognized value warns and falls back rather than throwing, so the app still boots. */
export const mapFrequency = (value?: string): TFrequency => {
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
        DEFAULT_FREQUENCY,
      );
      return DEFAULT_FREQUENCY;
    }
  }
};

/** `null` means "not a recognized shape" - the caller decides what default to fall back to. */
const parseMaxFilesValue = (value: string, frequency: TFrequency): number | null => {
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
};

/** `APP_ENV_LOGGER_FILE_MAX_FILES` -> pino-roll's `limit.count`: `'<n>d'` scales by frequency (hourly: days*24), a bare integer is a literal count, unrecognized falls back to `'5d'`. */
export const mapMaxFilesToCount = (opts: { value?: string; frequency: TFrequency }): number => {
  const { value, frequency } = opts;
  const normalized = value?.trim();

  if (normalized) {
    const parsed = parseMaxFilesValue(normalized, frequency);
    if (parsed !== null) {
      return parsed;
    }
  }

  // Unset is a normal configuration (mirror the sibling defaults) - only a PROVIDED value that failed to parse deserves a warning.
  if (normalized && normalized !== DEFAULT_MAX_FILES) {
    console.warn(
      '[mapMaxFilesToCount] Invalid logger file max files value | value: %s | fallback: %s',
      value,
      DEFAULT_MAX_FILES,
    );
  }

  return parseMaxFilesValue(DEFAULT_MAX_FILES, frequency) as number;
};

/** Pure: which destination pino should write to, derived from `APP_ENV_LOGGER_*` at CALL time. `DATE_PATTERN` is deliberately not read - pino-roll has no equivalent. */
export const resolveDestinationPlan = (): TDestinationPlan => {
  const folderPath = process.env.APP_ENV_LOGGER_FOLDER_PATH;

  if (folderPath && folderPath.trim() !== '') {
    const frequency = mapFrequency(process.env.APP_ENV_LOGGER_FILE_FREQUENCY);
    const count = mapMaxFilesToCount({
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
};

/** `pino.transport()` is SYNCHRONOUS - it returns a `ThreadStream` that BUFFERS writes until its worker thread loads, so no async gating is needed; `ModuleUtility.assertInstalled` runs first so a missing optional peer fails loudly here, not as an opaque worker-thread crash. */
export const buildDestination = (plan: TDestinationPlan): pino.DestinationStream | undefined => {
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
};

/** Pure: pino constructor options derived from env at CALL time. Exported so tests can build a REAL backing instance against an in-memory destination, without the impure singleton below. */
export const buildPinoOptions = () => ({
  name: Defaults.APPLICATION_NAME,
  level: resolveLoggerLevel({ configured: process.env.APP_ENV_LOGGER_LEVEL }),
  customLevels: PINO_CUSTOM_LEVELS,
});

let backingInstance: TPinoInstance | undefined;
/** The `ThreadStream` behind `backingInstance`, held ONLY when built via a transport (pretty/roll) and `undefined` for `stdout` or an injected instance - tracked so a replacement can close the worker instead of orphaning it. */
let backingTransport: pino.DestinationStream | undefined;

/** Lazy, env-driven singleton, built once and reused by every scope entirely synchronously - the very first log line already targets the real env-configured destination, no stdout bootstrap. `setPinoBackingLogger()` is the only way to replace it; this getter never resets it. */
export const getPinoBackingLogger = (): TPinoInstance => {
  if (!backingInstance) {
    const plan = resolveDestinationPlan();
    const destination = buildDestination(plan);
    backingInstance = pino(buildPinoOptions(), destination) as TPinoInstance;
    backingTransport = destination;
  }
  return backingInstance;
};

const closeBackingTransport = (): void => {
  if (!backingTransport) {
    return;
  }

  try {
    (backingTransport as AnyType).end();
  } catch (error) {
    console.error('[setPinoBackingLogger] Failed to close previous transport stream', error);
  }
};

/** Replaces the singleton outright: an outgoing transport-backed instance (pretty/roll) is a `ThreadStream` on a live worker thread, so this flushes then `.end()`s it first rather than orphaning the worker; failures are logged via `console.error`, never swallowed. */
export const setPinoBackingLogger = (opts: { instance: TPinoInstance }): void => {
  if (backingInstance) {
    backingInstance.flush();
    closeBackingTransport();
  }

  backingInstance = opts.instance;
  backingTransport = undefined;
};
