import type pino from 'pino';

/** Custom pino level NAMES layered on pino's four native levels so every `TLogLevel` name has a real method; `PINO_CUSTOM_LEVELS` in `./constants.ts` holds the NORMATIVE numeric floor. */
export type TPinoCustomLevelName = 'emerg';

/** The backing pino instance shape every `PinoLogger` writes through. */
export type TPinoInstance = pino.Logger<TPinoCustomLevelName>;

/** Injection point for `setPinoBackingLogger()` - tests and advanced apps supply their own instance. */
export interface IPinoLoggerOptions {
  instance?: TPinoInstance;
}
